// ============================================================
// TASKPILOT — MIGRATION TESTS
// supabase/tests/migrations.test.mjs
//
// These run the real DDL against a real PostgreSQL. They assert the things
// that only show up at runtime: constraints firing, triggers maintaining
// denormalised columns, and RLS actually filtering rows.
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest'
import { createTestDatabase, tableExists, rlsEnabled, policiesFor, indexesFor } from './harness.mjs'

let db
let alice
let bob

/**
 * Creates an auth user. The `on_auth_user_created` trigger from 001 inserts
 * the matching `profiles` and `user_settings` rows, so doing it here too
 * would collide on the primary key.
 */
async function newUser(email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  return rows[0].id
}

/**
 * Runs a callback as `userId` under the non-superuser `authenticated` role,
 * which is the only way RLS policies actually apply. Pass null for anonymous.
 */
async function as(userId, fn) {
  return db.asUser(userId, fn)
}

beforeAll(async () => {
  db = await createTestDatabase()
  alice = await newUser('alice@example.com')
  bob = await newUser('bob@example.com')
}, 120_000)

// ─── SCHEMA SHAPE ────────────────────────────────────────────

describe('migrations apply', () => {
  it('applies every migration in order', () => {
    expect(db.applied).toEqual([
      '001_initial_schema.sql',
      '002_marketplace.sql',
      '003_agent_registry.sql',
      '004_runtime.sql',
      '005_teams.sql',
      '006_platform.sql',
    ])
  })

  it('creates every table the application depends on', async () => {
    const expected = [
      'profiles', 'user_settings', 'subscriptions', 'usage_periods', 'ai_requests',
      'workflows', 'workflow_runs', 'integrations', 'saved_prompts',
      'marketplace_agents', 'agent_versions', 'agent_installs', 'agent_reviews', 'agent_purchases',
      'agent_runs', 'agent_run_steps', 'stored_files',
      'teams', 'team_members', 'team_invites', 'agent_shares',
      'notifications', 'notification_preferences', 'api_keys', 'api_key_usage', 'job_queue',
    ]
    for (const table of expected) {
      expect(await tableExists(db, table), `${table} should exist`).toBe(true)
    }
  })

  it('replaced agent_manifests with the versioned table, preserving the seeded manifests', async () => {
    expect(await tableExists(db, 'agent_manifests')).toBe(false)

    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM agent_versions WHERE is_current`
    )
    // The eight official agents seeded in 002 each carried one manifest.
    expect(rows[0].n).toBe(8)
  })

  it('enables row level security on every user-facing table', async () => {
    const tables = [
      'marketplace_agents', 'agent_versions', 'agent_installs', 'agent_reviews',
      'agent_runs', 'agent_run_steps', 'stored_files',
      'teams', 'team_members', 'team_invites', 'agent_shares',
      'notifications', 'api_keys', 'job_queue',
    ]
    for (const table of tables) {
      expect(await rlsEnabled(db, table), `${table} should have RLS`).toBe(true)
    }
  })

  it('leaves the job queue with no policies so only the service role reaches it', async () => {
    expect(await policiesFor(db, 'job_queue')).toHaveLength(0)
  })

  it('indexes the hot lookup paths', async () => {
    expect(await indexesFor(db, 'notifications')).toContain('idx_notifications_unread')
    expect(await indexesFor(db, 'job_queue')).toContain('idx_job_queue_claimable')
    expect(await indexesFor(db, 'api_keys')).toContain('idx_api_keys_hash_live')
  })
})

// ─── CONSTRAINTS ─────────────────────────────────────────────

describe('agent registry constraints', () => {
  it('allows exactly one current version per agent', async () => {
    const { rows } = await db.query(
      `INSERT INTO marketplace_agents (slug, name, category, goal, status)
       VALUES ('ver-test', 'Version test', 'automation', 'do a thing', 'draft') RETURNING id`
    )
    const agentId = rows[0].id

    await db.query(
      `INSERT INTO agent_versions (agent_id, version, manifest, is_current) VALUES ($1,'1.0.0','{}',TRUE)`,
      [agentId]
    )

    await expect(
      db.query(
        `INSERT INTO agent_versions (agent_id, version, manifest, is_current) VALUES ($1,'1.1.0','{}',TRUE)`,
        [agentId]
      )
    ).rejects.toThrow(/unique|duplicate/i)
  })

  it('publish_agent_version swaps the current flag atomically', async () => {
    const { rows } = await db.query(
      `INSERT INTO marketplace_agents (slug, name, category, goal, status)
       VALUES ('pub-test', 'Publish test', 'automation', 'do a thing', 'draft') RETURNING id`
    )
    const agentId = rows[0].id

    await db.query(`SELECT publish_agent_version($1, '1.0.0', '{"a":1}'::jsonb)`, [agentId])
    await db.query(`SELECT publish_agent_version($1, '1.1.0', '{"a":2}'::jsonb, 'second cut')`, [agentId])

    const current = await db.query(
      `SELECT version, changelog FROM agent_versions WHERE agent_id = $1 AND is_current`,
      [agentId]
    )
    expect(current.rows).toHaveLength(1)
    expect(current.rows[0].version).toBe('1.1.0')
    expect(current.rows[0].changelog).toBe('second cut')

    const listing = await db.query(`SELECT version FROM marketplace_agents WHERE id = $1`, [agentId])
    expect(listing.rows[0].version).toBe('1.1.0')
  })

  it('refuses a private agent with a non-zero price', async () => {
    await expect(
      db.query(
        `INSERT INTO marketplace_agents (slug, name, category, goal, visibility, price_cents)
         VALUES ('paid-private', 'Paid private', 'automation', 'x', 'private', 500)`
      )
    ).rejects.toThrow(/private_not_priced|check constraint/i)
  })

  it('rejects an out-of-range review rating and a duplicate review', async () => {
    const { rows } = await db.query(
      `INSERT INTO marketplace_agents (slug, name, category, goal, status)
       VALUES ('rate-test', 'Rate test', 'automation', 'x', 'listed') RETURNING id`
    )
    const agentId = rows[0].id

    await expect(
      db.query(`INSERT INTO agent_reviews (agent_id, user_id, rating) VALUES ($1,$2,9)`, [agentId, alice])
    ).rejects.toThrow(/check constraint/i)

    await db.query(`INSERT INTO agent_reviews (agent_id, user_id, rating) VALUES ($1,$2,4)`, [agentId, alice])
    await expect(
      db.query(`INSERT INTO agent_reviews (agent_id, user_id, rating) VALUES ($1,$2,5)`, [agentId, alice])
    ).rejects.toThrow(/unique|duplicate/i)
  })

  it('keeps the listing rating in step with its reviews', async () => {
    const { rows } = await db.query(
      `INSERT INTO marketplace_agents (slug, name, category, goal, status)
       VALUES ('agg-test', 'Aggregate test', 'automation', 'x', 'listed') RETURNING id`
    )
    const agentId = rows[0].id

    await db.query(`INSERT INTO agent_reviews (agent_id, user_id, rating) VALUES ($1,$2,5)`, [agentId, alice])
    await db.query(`INSERT INTO agent_reviews (agent_id, user_id, rating) VALUES ($1,$2,3)`, [agentId, bob])

    let listing = await db.query(
      `SELECT rating_avg::float AS avg, rating_count FROM marketplace_agents WHERE id = $1`,
      [agentId]
    )
    expect(listing.rows[0].avg).toBe(4)
    expect(listing.rows[0].rating_count).toBe(2)

    // Deleting a review must recompute, not leave a stale average.
    await db.query(`DELETE FROM agent_reviews WHERE agent_id = $1 AND user_id = $2`, [agentId, bob])
    listing = await db.query(
      `SELECT rating_avg::float AS avg, rating_count FROM marketplace_agents WHERE id = $1`,
      [agentId]
    )
    expect(listing.rows[0].avg).toBe(5)
    expect(listing.rows[0].rating_count).toBe(1)
  })

  it('allows a user to install an agent only once', async () => {
    const { rows } = await db.query(
      `INSERT INTO marketplace_agents (slug, name, category, goal, status)
       VALUES ('inst-test', 'Install test', 'automation', 'x', 'listed') RETURNING id`
    )
    const agentId = rows[0].id

    await db.query(`INSERT INTO agent_installs (agent_id, user_id, version) VALUES ($1,$2,'1.0.0')`, [agentId, alice])
    await expect(
      db.query(`INSERT INTO agent_installs (agent_id, user_id, version) VALUES ($1,$2,'1.0.0')`, [agentId, alice])
    ).rejects.toThrow(/unique|duplicate/i)
  })
})

// ─── RUNS ────────────────────────────────────────────────────

describe('run history', () => {
  async function newRun(userId = alice) {
    const { rows } = await db.query(
      `INSERT INTO agent_runs (user_id, goal) VALUES ($1, 'collect the emails') RETURNING id, started_at`,
      [userId]
    )
    return rows[0]
  }

  it('requires a run to belong to a user or an anonymous session', async () => {
    await expect(
      db.query(`INSERT INTO agent_runs (goal) VALUES ('orphan run')`)
    ).rejects.toThrow(/owner_present|check constraint/i)
  })

  it('maintains step counters from the steps themselves', async () => {
    const run = await newRun()

    await db.query(
      `INSERT INTO agent_run_steps (run_id, step_index, step_id, action, status)
       VALUES ($1,0,'read','read_page','succeeded'),
              ($1,1,'mail','extract_emails','succeeded'),
              ($1,2,'push','push_integration','failed')`,
      [run.id]
    )

    const { rows } = await db.query(
      `SELECT steps_total, steps_completed FROM agent_runs WHERE id = $1`,
      [run.id]
    )
    expect(rows[0].steps_total).toBe(3)
    expect(rows[0].steps_completed).toBe(2)
  })

  it('counts skipped steps as completed progress', async () => {
    const run = await newRun()
    await db.query(
      `INSERT INTO agent_run_steps (run_id, step_index, step_id, action, status)
       VALUES ($1,0,'a','read_page','succeeded'), ($1,1,'b','screenshot','skipped')`,
      [run.id]
    )
    const { rows } = await db.query(`SELECT steps_completed FROM agent_runs WHERE id = $1`, [run.id])
    expect(rows[0].steps_completed).toBe(2)
  })

  it('stamps finished_at and duration when a run reaches a terminal state', async () => {
    const run = await newRun()
    await db.query(`UPDATE agent_runs SET status = 'completed' WHERE id = $1`, [run.id])

    const { rows } = await db.query(
      `SELECT finished_at, duration_ms FROM agent_runs WHERE id = $1`,
      [run.id]
    )
    expect(rows[0].finished_at).not.toBeNull()
    expect(rows[0].duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('does not stamp completion for a non-terminal transition', async () => {
    const run = await newRun()
    await db.query(`UPDATE agent_runs SET status = 'running' WHERE id = $1`, [run.id])
    const { rows } = await db.query(`SELECT finished_at FROM agent_runs WHERE id = $1`, [run.id])
    expect(rows[0].finished_at).toBeNull()
  })

  it('reports a success rate without dividing by zero for an unused agent', async () => {
    const { rows } = await db.query(
      `SELECT success_rate, total_runs FROM v_agent_performance WHERE slug = 'page-summarizer'`
    )
    expect(rows[0].total_runs).toBe(0)
    expect(rows[0].success_rate).toBeNull()
  })

  it('cascades step deletion when a run is removed', async () => {
    const run = await newRun()
    await db.query(
      `INSERT INTO agent_run_steps (run_id, step_index, step_id, action) VALUES ($1,0,'a','read_page')`,
      [run.id]
    )
    await db.query(`DELETE FROM agent_runs WHERE id = $1`, [run.id])
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM agent_run_steps WHERE run_id = $1`, [run.id])
    expect(rows[0].n).toBe(0)
  })
})

// ─── TEAMS ───────────────────────────────────────────────────

describe('teams', () => {
  it('adds the creator as owner automatically', async () => {
    const { rows } = await db.query(
      `INSERT INTO teams (name, slug, owner_id) VALUES ('Acme','acme',$1) RETURNING id`,
      [alice]
    )
    const teamId = rows[0].id

    const members = await db.query(
      `SELECT user_id, role FROM team_members WHERE team_id = $1`,
      [teamId]
    )
    expect(members.rows).toHaveLength(1)
    expect(members.rows[0].user_id).toBe(alice)
    expect(members.rows[0].role).toBe('owner')
  })

  it('refuses to admit more members than the team has seats', async () => {
    const { rows } = await db.query(
      `INSERT INTO teams (name, slug, owner_id, seats) VALUES ('Tiny','tiny',$1,1) RETURNING id`,
      [alice]
    )
    // The owner already occupies the single seat.
    await expect(
      db.query(`INSERT INTO team_members (team_id, user_id) VALUES ($1,$2)`, [rows[0].id, bob])
    ).rejects.toThrow(/no seats left/i)
  })

  it('resolves membership and management rights through the helper functions', async () => {
    const { rows } = await db.query(
      `INSERT INTO teams (name, slug, owner_id, seats) VALUES ('Helpers','helpers',$1,5) RETURNING id`,
      [alice]
    )
    const teamId = rows[0].id
    await db.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1,$2,'viewer')`, [teamId, bob])

    const checks = await db.query(
      `SELECT is_team_member($1,$2) AS alice_member,
              is_team_member($1,$3) AS bob_member,
              can_manage_team($1,$2) AS alice_manages,
              can_manage_team($1,$3) AS bob_manages`,
      [teamId, alice, bob]
    )
    expect(checks.rows[0]).toMatchObject({
      alice_member: true,
      bob_member: true,
      alice_manages: true,
      bob_manages: false,
    })
  })

  it('issues a unique single-use token per pending invite', async () => {
    const { rows } = await db.query(
      `INSERT INTO teams (name, slug, owner_id) VALUES ('Invites','invites',$1) RETURNING id`,
      [alice]
    )
    const teamId = rows[0].id

    const invite = await db.query(
      `INSERT INTO team_invites (team_id, email, invited_by) VALUES ($1,'new@example.com',$2)
       RETURNING token, expires_at`,
      [teamId, alice]
    )
    expect(invite.rows[0].token).toMatch(/^[0-9a-f]{48}$/)
    expect(new Date(invite.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now())

    // A second pending invite to the same address would be ambiguous.
    await expect(
      db.query(`INSERT INTO team_invites (team_id, email) VALUES ($1,'NEW@example.com')`, [teamId])
    ).rejects.toThrow(/unique|duplicate/i)
  })
})

// ─── JOB QUEUE ───────────────────────────────────────────────

describe('job queue', () => {
  it('claims jobs in priority order and marks them processing', async () => {
    await db.query(`DELETE FROM job_queue`)
    await db.query(
      `INSERT INTO job_queue (type, payload, priority) VALUES
        ('usage_rollup','{}',0), ('run_agent','{}',10), ('cache_sweep','{}',5)`
    )

    const { rows } = await db.query(`SELECT * FROM claim_jobs('worker-1', 2)`)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.type)).toEqual(['run_agent', 'cache_sweep'])
    expect(rows.every((r) => r.status === 'processing' && r.locked_by === 'worker-1')).toBe(true)
    expect(rows.every((r) => r.attempts === 1)).toBe(true)
  })

  it('does not claim a job scheduled for the future', async () => {
    await db.query(`DELETE FROM job_queue`)
    await db.query(
      `INSERT INTO job_queue (type, run_after) VALUES ('cache_sweep', NOW() + INTERVAL '1 hour')`
    )
    const { rows } = await db.query(`SELECT * FROM claim_jobs('worker-1', 5)`)
    expect(rows).toHaveLength(0)
  })

  it('requeues a failed job with backoff, then parks it as dead', async () => {
    await db.query(`DELETE FROM job_queue`)
    const { rows } = await db.query(
      `INSERT INTO job_queue (type, max_attempts) VALUES ('export_generate', 2) RETURNING id`
    )
    const jobId = rows[0].id

    await db.query(`SELECT * FROM claim_jobs('w', 1)`)
    await db.query(`SELECT fail_job($1, 'boom')`, [jobId])

    let job = await db.query(`SELECT status, attempts, run_after FROM job_queue WHERE id = $1`, [jobId])
    expect(job.rows[0].status).toBe('queued')
    expect(job.rows[0].attempts).toBe(1)
    expect(new Date(job.rows[0].run_after).getTime()).toBeGreaterThan(Date.now())

    // Make it eligible again, exhaust the budget, and confirm it parks.
    await db.query(`UPDATE job_queue SET run_after = NOW() WHERE id = $1`, [jobId])
    await db.query(`SELECT * FROM claim_jobs('w', 1)`)
    await db.query(`SELECT fail_job($1, 'boom again')`, [jobId])

    job = await db.query(`SELECT status, attempts, last_error FROM job_queue WHERE id = $1`, [jobId])
    expect(job.rows[0].status).toBe('dead')
    expect(job.rows[0].attempts).toBe(2)
    expect(job.rows[0].last_error).toBe('boom again')
  })

  it('recovers jobs abandoned by a stalled worker', async () => {
    await db.query(`DELETE FROM job_queue`)
    await db.query(`INSERT INTO job_queue (type) VALUES ('notification_dispatch')`)
    await db.query(`SELECT * FROM claim_jobs('doomed-worker', 1)`)
    await db.query(`UPDATE job_queue SET locked_at = NOW() - INTERVAL '1 hour'`)

    const { rows } = await db.query(`SELECT requeue_stalled_jobs(15) AS n`)
    expect(rows[0].n).toBe(1)

    const job = await db.query(`SELECT status, locked_by FROM job_queue LIMIT 1`)
    expect(job.rows[0].status).toBe('queued')
    expect(job.rows[0].locked_by).toBeNull()
  })

  it('rejects a duplicate in-flight job with the same dedupe key', async () => {
    await db.query(`DELETE FROM job_queue`)
    await db.query(`INSERT INTO job_queue (type, dedupe_key) VALUES ('run_agent','run:42')`)
    await expect(
      db.query(`INSERT INTO job_queue (type, dedupe_key) VALUES ('run_agent','run:42')`)
    ).rejects.toThrow(/unique|duplicate/i)

    // Once it finishes, the same key may be enqueued again.
    await db.query(`UPDATE job_queue SET status = 'succeeded' WHERE dedupe_key = 'run:42'`)
    await expect(
      db.query(`INSERT INTO job_queue (type, dedupe_key) VALUES ('run_agent','run:42')`)
    ).resolves.toBeTruthy()
  })
})

// ─── NOTIFICATIONS ───────────────────────────────────────────

describe('notifications', () => {
  it('creates a notification through the helper and marks it read', async () => {
    await db.query(`DELETE FROM notifications`)
    await db.query(
      `SELECT notify_user($1, 'run_completed', 'Run finished', 'Collected 12 emails', '/dashboard/runs/1')`,
      [alice]
    )

    let unread = await db.query(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [alice]
    )
    expect(unread.rows[0].n).toBe(1)

    const marked = await db.query(`SELECT mark_notifications_read($1) AS n`, [alice])
    expect(marked.rows[0].n).toBe(1)

    unread = await db.query(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [alice]
    )
    expect(unread.rows[0].n).toBe(0)
  })
})

// ─── ROW LEVEL SECURITY ──────────────────────────────────────

describe('row level security', () => {
  it("hides one user's runs from another", async () => {
    await db.query(`DELETE FROM agent_runs`)
    await db.query(`INSERT INTO agent_runs (user_id, goal) VALUES ($1,'alice private run')`, [alice])
    await db.query(`INSERT INTO agent_runs (user_id, goal) VALUES ($1,'bob private run')`, [bob])

    const aliceSees = await as(alice, () => db.query(`SELECT goal FROM agent_runs`))
    expect(aliceSees.rows.map((r) => r.goal)).toEqual(['alice private run'])

    const bobSees = await as(bob, () => db.query(`SELECT goal FROM agent_runs`))
    expect(bobSees.rows.map((r) => r.goal)).toEqual(['bob private run'])

    const anonSees = await as(null, () => db.query(`SELECT goal FROM agent_runs`))
    expect(anonSees.rows).toHaveLength(0)
  })

  it('stops a user writing a run attributed to someone else', async () => {
    await expect(
      as(bob, () =>
        db.query(`INSERT INTO agent_runs (user_id, goal) VALUES ($1,'forged')`, [alice])
      )
    ).rejects.toThrow(/row-level security/i)
  })

  it('hides a draft agent from everyone but its owner', async () => {
    await db.query(
      `INSERT INTO marketplace_agents (slug, name, category, goal, status, visibility, owner_id)
       VALUES ('secret-draft','Secret draft','automation','x','draft','private',$1)`,
      [alice]
    )

    const ownerSees = await as(alice, () =>
      db.query(`SELECT slug FROM marketplace_agents WHERE slug = 'secret-draft'`)
    )
    expect(ownerSees.rows).toHaveLength(1)

    const otherSees = await as(bob, () =>
      db.query(`SELECT slug FROM marketplace_agents WHERE slug = 'secret-draft'`)
    )
    expect(otherSees.rows).toHaveLength(0)
  })

  it('shows listed public agents to anonymous visitors', async () => {
    const anonSees = await as(null, () =>
      db.query(
        `SELECT COUNT(*)::int AS n FROM marketplace_agents WHERE status = 'listed' AND visibility = 'public'`
      )
    )
    expect(anonSees.rows[0].n).toBeGreaterThan(0)
  })

  it('gates an agent manifest behind ownership, purchase or install', async () => {
    const { rows } = await db.query(
      `INSERT INTO marketplace_agents (slug, name, category, goal, status, price_cents, owner_id)
       VALUES ('gated','Gated','automation','x','listed',1900,$1) RETURNING id`,
      [alice]
    )
    const agentId = rows[0].id
    await db.query(
      `INSERT INTO agent_versions (agent_id, version, manifest, is_current)
       VALUES ($1,'1.0.0','{"secret":true}',TRUE)`,
      [agentId]
    )

    const owner = await as(alice, () =>
      db.query(`SELECT manifest FROM agent_versions WHERE agent_id = $1`, [agentId])
    )
    expect(owner.rows).toHaveLength(1)

    let stranger = await as(bob, () =>
      db.query(`SELECT manifest FROM agent_versions WHERE agent_id = $1`, [agentId])
    )
    expect(stranger.rows).toHaveLength(0)

    // A completed purchase is what unlocks the manifest.
    await db.query(
      `INSERT INTO agent_purchases (agent_id, buyer_id, amount_cents, status)
       VALUES ($1,$2,1900,'completed')`,
      [agentId, bob]
    )
    stranger = await as(bob, () =>
      db.query(`SELECT manifest FROM agent_versions WHERE agent_id = $1`, [agentId])
    )
    expect(stranger.rows).toHaveLength(1)
  })

  it('keeps notifications private to their recipient', async () => {
    await db.query(`DELETE FROM notifications`)
    await db.query(`SELECT notify_user($1,'system','For Alice')`, [alice])
    await db.query(`SELECT notify_user($1,'system','For Bob')`, [bob])

    const bobSees = await as(bob, () => db.query(`SELECT title FROM notifications`))
    expect(bobSees.rows.map((r) => r.title)).toEqual(['For Bob'])
  })

  it('does not let a client fabricate a notification', async () => {
    await expect(
      as(bob, () =>
        db.query(
          `INSERT INTO notifications (user_id, type, title) VALUES ($1,'subscription','Payment received')`,
          [bob]
        )
      )
    ).rejects.toThrow(/row-level security/i)
  })

  it('lets team members see their team but not other teams', async () => {
    const { rows } = await db.query(
      `INSERT INTO teams (name, slug, owner_id, seats) VALUES ('RLS Team','rls-team',$1,5) RETURNING id`,
      [alice]
    )
    const teamId = rows[0].id

    const memberSees = await as(alice, () => db.query(`SELECT slug FROM teams WHERE id = $1`, [teamId]))
    expect(memberSees.rows).toHaveLength(1)

    const outsiderSees = await as(bob, () => db.query(`SELECT slug FROM teams WHERE id = $1`, [teamId]))
    expect(outsiderSees.rows).toHaveLength(0)
  })

  it('does not recurse when a team_members policy checks membership', async () => {
    const { rows } = await db.query(
      `INSERT INTO teams (name, slug, owner_id, seats) VALUES ('Recursion','recursion',$1,5) RETURNING id`,
      [alice]
    )

    // A policy that queries team_members directly raises
    // "infinite recursion detected in policy for relation team_members".
    const result = await as(alice, () =>
      db.query(`SELECT role FROM team_members WHERE team_id = $1`, [rows[0].id])
    )
    expect(result.rows[0].role).toBe('owner')
  })

  it('makes a team-visible agent readable by that team only', async () => {
    const { rows: teamRows } = await db.query(
      `INSERT INTO teams (name, slug, owner_id, seats) VALUES ('Shared','shared',$1,5) RETURNING id`,
      [alice]
    )
    const teamId = teamRows[0].id

    await db.query(
      `INSERT INTO marketplace_agents (slug, name, category, goal, status, visibility, owner_id, team_id)
       VALUES ('team-only','Team only','automation','x','draft','team',$1,$2)`,
      [alice, teamId]
    )

    // Bob is outside the team.
    let bobSees = await as(bob, () =>
      db.query(`SELECT slug FROM marketplace_agents WHERE slug = 'team-only'`)
    )
    expect(bobSees.rows).toHaveLength(0)

    await db.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1,$2,'member')`, [teamId, bob])

    bobSees = await as(bob, () =>
      db.query(`SELECT slug FROM marketplace_agents WHERE slug = 'team-only'`)
    )
    expect(bobSees.rows).toHaveLength(1)
  })

  it('keeps the job queue unreachable from an authenticated client', async () => {
    const result = await as(alice, () => db.query(`SELECT * FROM job_queue`))
    expect(result.rows).toHaveLength(0)
  })
})
