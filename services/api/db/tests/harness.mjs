// ============================================================
// TASKPILOT — MIGRATION TEST HARNESS
// supabase/tests/harness.mjs
//
// Runs every migration against a real PostgreSQL (PGlite, Postgres
// compiled to WASM) so DDL, constraints, triggers, functions and RLS
// policy syntax are actually executed rather than eyeballed.
//
// Supabase supplies `auth.users` and `auth.uid()`; PGlite does not, so
// the harness stands up equivalents before the migrations run. `auth.uid()`
// reads a session GUC, which also lets tests impersonate a user and assert
// that row-level security really filters rows.
// ============================================================

import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

/** The slice of Supabase's auth schema the migrations depend on. */
const AUTH_SHIM = `
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                TEXT UNIQUE,
  raw_user_meta_data   JSONB DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Supabase derives this from the request JWT. Here it reads a GUC so a test
-- can impersonate a user with set_config('request.jwt.claim.sub', ...).
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$ LANGUAGE sql STABLE;

CREATE SCHEMA IF NOT EXISTS storage;
`

/**
 * Supabase runs API requests as the non-superuser `authenticated` role, which
 * is why RLS applies to them. PGlite connects as the bootstrap superuser, and
 * a superuser bypasses RLS unconditionally — FORCE ROW LEVEL SECURITY does
 * not change that. Testing policies therefore requires switching to a plain
 * role, exactly as production does.
 */
const ROLE_SHIM = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, auth TO authenticated, anon;
`

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

export function readMigration(name) {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8')
}

/**
 * Boots a database with the auth shim and every migration applied in order.
 * Throws with the offending filename if a migration fails, which is the
 * whole point of running them here.
 */
export async function createTestDatabase({ upTo } = {}) {
  const db = await PGlite.create({
    extensions: { uuid_ossp, pgcrypto, pg_trgm },
  })

  await db.exec('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
  await db.exec('CREATE EXTENSION IF NOT EXISTS "pgcrypto";')
  await db.exec('CREATE EXTENSION IF NOT EXISTS "pg_trgm";')
  await db.exec(AUTH_SHIM)

  const applied = []
  for (const file of migrationFiles()) {
    await db.exec(readMigration(file)).catch((err) => {
      throw new Error(`Migration ${file} failed: ${err.message}`)
    })
    applied.push(file)
    if (upTo && file === upTo) break
  }

  // Grants must come after the migrations so every table exists.
  await db.exec(ROLE_SHIM)

  return Object.assign(db, {
    applied,

    /**
     * Runs `fn` with RLS in force, impersonating `userId` (or the anonymous
     * role when null). Always returns to the superuser afterwards so
     * subsequent setup queries are unrestricted.
     */
    async asUser(userId, fn) {
      await db.exec(`SET ROLE ${userId ? 'authenticated' : 'anon'};`)
      await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ''])
      try {
        return await fn(db)
      } finally {
        await db.exec('RESET ROLE;')
        await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`)
      }
    },

    /**
     * Inserts an auth user. The `on_auth_user_created` trigger creates the
     * matching profile and settings rows.
     */
    async createUser(email) {
      const { rows } = await db.query(
        `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`,
        [email]
      )
      return rows[0].id
    },
  })
}

/** Column metadata for a table, keyed by column name. */
export async function describeTable(db, table, schema = 'public') {
  const { rows } = await db.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2`,
    [schema, table]
  )
  return Object.fromEntries(rows.map((r) => [r.column_name, r]))
}

export async function tableExists(db, table, schema = 'public') {
  const { rows } = await db.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    [schema, table]
  )
  return rows.length > 0
}

export async function policiesFor(db, table) {
  const { rows } = await db.query(`SELECT policyname, cmd FROM pg_policies WHERE tablename = $1`, [
    table,
  ])
  return rows
}

export async function rlsEnabled(db, table) {
  const { rows } = await db.query(
    `SELECT relrowsecurity FROM pg_class WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
    [table]
  )
  return rows[0]?.relrowsecurity === true
}

export async function indexesFor(db, table) {
  const { rows } = await db.query(`SELECT indexname FROM pg_indexes WHERE tablename = $1`, [table])
  return rows.map((r) => r.indexname)
}
