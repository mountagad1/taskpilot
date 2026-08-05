'use client'

// ============================================================
// TASKPILOT — TEAMS
// apps/web/src/app/dashboard/teams/page.tsx
//
// Create a team, invite people, manage roles. Seat limits are enforced by a
// database trigger, so the UI surfaces the resulting error rather than
// duplicating the rule.
// ============================================================

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { TEAM_ROLE_RANK, type TeamRole } from '@taskpilot/shared'

import { api, useApiList, useMutation } from '@/lib/client/api'
import { EmptyState, ErrorState, SkeletonList } from '@/components/states'
import { IconPlug } from '@/components/ui/icons'

interface TeamRow {
  id: string
  name: string
  slug: string
  plan: string
  seats: number
  owner_id: string
  role: TeamRole
  created_at: string
}

interface MemberRow {
  id: string
  user_id: string
  role: TeamRole
  joined_at: string
  profile: { email: string; name: string | null; avatar_url: string | null } | null
}

interface InviteRow {
  id: string
  email: string
  role: TeamRole
  expires_at: string
  created_at: string
}

export default function TeamsPage() {
  const { items, loading, error, reload } = useApiList<TeamRow>('/v1/teams')
  const [selected, setSelected] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('token')

  useEffect(() => {
    if (!selected && items.length) setSelected(items[0].id)
  }, [items, selected])

  const team = items.find((t) => t.id === selected) ?? null

  return (
    <div style={{ padding: 28, maxWidth: 900 }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Teams</h1>
        <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', marginTop: 4 }}>
          Share agents and workflows with your colleagues.
        </p>
      </header>

      {inviteToken && <AcceptInvite token={inviteToken} onAccepted={reload} />}

      {loading ? (
        <SkeletonList rows={2} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <>
          <EmptyState
            icon={<IconPlug size={22} />}
            title="You are not in a team yet"
            description="Create a team to share agents, or accept an invitation from a colleague."
          />
          <div style={{ marginTop: 18 }}>
            <CreateTeamForm onCreated={reload} />
          </div>
        </>
      ) : (
        <>
          {items.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
              {items.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setSelected(option.id)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 20,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    border: `1px solid ${selected === option.id ? 'rgba(99,102,241,0.45)' : 'var(--border-subtle)'}`,
                    background: selected === option.id ? 'rgba(99,102,241,0.15)' : 'var(--surface)',
                    color: selected === option.id ? 'var(--indigo-light)' : 'var(--foreground-secondary)',
                  }}
                >
                  {option.name}
                </button>
              ))}
            </div>
          )}

          {team && <TeamPanel team={team} />}

          <details style={{ marginTop: 26 }}>
            <summary style={{ fontSize: 13, color: 'var(--foreground-tertiary)', cursor: 'pointer' }}>
              Create another team
            </summary>
            <div style={{ marginTop: 12 }}>
              <CreateTeamForm onCreated={reload} />
            </div>
          </details>
        </>
      )}
    </div>
  )
}

// ─── ACCEPT INVITE ───────────────────────────────────────────

function AcceptInvite({ token, onAccepted }: { token: string; onAccepted: () => void }) {
  const [done, setDone] = useState(false)

  const accept = useMutation(async () => {
    const result = await api.post<{ team: { name: string } }>('/v1/teams/invites/accept', { token })
    setDone(true)
    onAccepted()
    return result
  })

  if (done) return null

  return (
    <div
      className="ui-card"
      style={{ padding: 16, marginBottom: 20, borderColor: 'rgba(99,102,241,0.35)' }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>You have a team invitation</div>
      <p style={{ fontSize: 12.5, color: 'var(--foreground-secondary)', marginBottom: 11 }}>
        Accepting adds you to the team and gives you access to its shared agents.
      </p>

      <button className="btn btn-primary btn-sm" disabled={accept.pending} onClick={() => void accept.run(undefined)}>
        {accept.pending ? 'Joining…' : 'Accept invitation'}
      </button>

      {accept.error && <div style={{ fontSize: 12.5, color: '#f87171', marginTop: 9 }}>{accept.error}</div>}
    </div>
  )
}

// ─── TEAM PANEL ──────────────────────────────────────────────

function TeamPanel({ team }: { team: TeamRow }) {
  const members = useApiList<MemberRow>(`/v1/teams/${team.id}/members`, [team.id])
  const canManage = TEAM_ROLE_RANK[team.role] >= TEAM_ROLE_RANK.admin
  const invites = useApiList<InviteRow>(canManage ? `/v1/teams/${team.id}/invites` : null, [team.id])

  const seatsUsed = members.items.length

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{team.name}</span>
          <span
            style={{
              fontSize: 10.5,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '2px 8px',
              borderRadius: 20,
              background: 'rgba(99,102,241,0.15)',
              color: 'var(--indigo-light)',
            }}
          >
            {team.role}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--foreground-muted)' }}>
            {seatsUsed}/{team.seats} seats
          </span>
        </div>
      </div>

      {canManage && <InviteForm teamId={team.id} onInvited={invites.reload} seatsFull={seatsUsed >= team.seats} />}

      <section>
        <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Members</h2>

        {members.loading ? (
          <SkeletonList rows={2} />
        ) : members.error ? (
          <ErrorState message={members.error} onRetry={members.reload} />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {members.items.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                team={team}
                canManage={canManage}
                onChanged={members.reload}
              />
            ))}
          </div>
        )}
      </section>

      {canManage && invites.items.length > 0 && (
        <section>
          <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Pending invitations</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {invites.items.map((invite) => (
              <div
                key={invite.id}
                className="ui-card"
                style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <span style={{ fontSize: 13 }}>{invite.email}</span>
                <span style={{ fontSize: 11.5, color: 'var(--foreground-muted)' }}>{invite.role}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--foreground-muted)' }}>
                  Expires {new Date(invite.expires_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function MemberCard({
  member,
  team,
  canManage,
  onChanged,
}: {
  member: MemberRow
  team: TeamRow
  canManage: boolean
  onChanged: () => void
}) {
  const isOwner = member.user_id === team.owner_id

  const changeRole = useMutation(async (role: TeamRole) => {
    const result = await api.patch(`/v1/teams/${team.id}/members`, { user_id: member.user_id, role })
    onChanged()
    return result
  })

  const remove = useMutation(async () => {
    const result = await api.delete(`/v1/teams/${team.id}/members?user_id=${member.user_id}`)
    onChanged()
    return result
  })

  return (
    <div className="ui-card" style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 11 }}>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: 'var(--surface-hover)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          color: 'var(--foreground-secondary)',
          flex: 'none',
        }}
      >
        {(member.profile?.name ?? member.profile?.email ?? '?').charAt(0).toUpperCase()}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5 }}>{member.profile?.name ?? member.profile?.email ?? 'Unknown'}</div>
        {member.profile?.name && (
          <div style={{ fontSize: 11.5, color: 'var(--foreground-muted)' }}>{member.profile.email}</div>
        )}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {canManage && !isOwner ? (
          <select
            value={member.role}
            disabled={changeRole.pending}
            onChange={(e) => void changeRole.run(e.target.value as TeamRole)}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 7,
              padding: '4px 8px',
              color: 'var(--foreground-secondary)',
              fontSize: 12,
            }}
          >
            <option value="viewer">viewer</option>
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
        ) : (
          <span style={{ fontSize: 11.5, color: 'var(--foreground-muted)' }}>{member.role}</span>
        )}

        {canManage && !isOwner && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: '#f87171' }}
            disabled={remove.pending}
            onClick={() => void remove.run(undefined)}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

// ─── FORMS ───────────────────────────────────────────────────

function CreateTeamForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')

  const create = useMutation(async () => {
    const result = await api.post('/v1/teams', { name: name.trim() })
    setName('')
    onCreated()
    return result
  })

  return (
    <form
      className="ui-card"
      style={{ padding: 16, display: 'flex', gap: 9, alignItems: 'flex-start' }}
      onSubmit={(event) => {
        event.preventDefault()
        void create.run(undefined)
      }}
    >
      <div style={{ flex: 1 }}>
        <input
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team name"
          maxLength={80}
        />
        {(create.error || create.fieldErrors.name) && (
          <div style={{ fontSize: 11.5, color: '#f87171', marginTop: 5 }}>
            {create.fieldErrors.name ?? create.error}
          </div>
        )}
      </div>

      <button className="btn btn-primary btn-sm" type="submit" disabled={create.pending}>
        {create.pending ? 'Creating…' : 'Create team'}
      </button>
    </form>
  )
}

function InviteForm({
  teamId,
  onInvited,
  seatsFull,
}: {
  teamId: string
  onInvited: () => void
  seatsFull: boolean
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<TeamRole>('member')

  const invite = useMutation(async () => {
    const result = await api.post(`/v1/teams/${teamId}/invites`, { email: email.trim(), role })
    setEmail('')
    onInvited()
    return result
  })

  return (
    <form
      className="ui-card"
      style={{ padding: 16 }}
      onSubmit={(event) => {
        event.preventDefault()
        void invite.run(undefined)
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Invite someone</div>

      <div style={{ display: 'flex', gap: 9 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@company.com"
        />
        <select
          style={{ ...inputStyle, width: 120 }}
          value={role}
          onChange={(e) => setRole(e.target.value as TeamRole)}
        >
          <option value="viewer">viewer</option>
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <button className="btn btn-primary btn-sm" type="submit" disabled={invite.pending || seatsFull}>
          {invite.pending ? 'Sending…' : 'Invite'}
        </button>
      </div>

      {seatsFull && (
        <div style={{ fontSize: 11.5, color: '#fbbf24', marginTop: 8 }}>
          All seats are taken. Remove a member or upgrade the team to invite more people.
        </div>
      )}

      {(invite.error || invite.fieldErrors.email) && (
        <div style={{ fontSize: 11.5, color: '#f87171', marginTop: 8 }}>
          {invite.fieldErrors.email ?? invite.error}
        </div>
      )}
    </form>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 9,
  padding: '9px 11px',
  color: 'var(--foreground)',
  fontSize: 13.5,
  outline: 'none',
  fontFamily: 'inherit',
}
