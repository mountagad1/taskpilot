// ============================================================
// TASKPILOT — FOUNDERS
// apps/web/src/components/marketing/founders.tsx
//
// Replaces the removed testimonials in the page's rhythm, and does the job
// those were pretending to do: put real, checkable names behind the
// product. Every claim here is attributable — each card links to the
// person's own profile, so a visitor can verify it rather than take the
// page's word for it.
//
// FOUNDERS is exported because the Organization structured data lists the
// same people; deriving both from one array keeps the markup and the
// visible page from drifting.
// ============================================================

import { IconArrowRight } from '@/components/ui/icons'

export interface Founder {
  name: string
  initials: string
  role: string
  bio: string
  href: string
  linkLabel: string
  /** Square avatar in /public. Falls back to initials when absent. */
  photo?: string
  accent: string
  bg: string
}

export const FOUNDERS: Founder[] = [
  {
    name: 'Mountaga Diallo',
    initials: 'MD',
    role: 'Co-founder & CEO',
    bio: 'Founder and startup builder, based in Le Mans, France. Also behind Page2doc — turning web pages into clean spreadsheets, the same problem that grew into TaskPilot. Professional Baccalaureate in commerce from Ecofac Business School.',
    href: 'https://www.linkedin.com/in/mountaga-diallo-0a7111268/',
    linkLabel: 'LinkedIn',
    photo: '/team/mountaga-diallo.jpg',
    accent: 'var(--indigo-light)',
    bg: 'rgba(109,118,245,0.16)',
  },
  {
    name: 'Yuki Nakamura',
    initials: 'YN',
    role: 'Co-founder & CTO',
    bio: 'Senior full-stack and AI engineer. Builds the agent systems behind Browser Actions — Google ADK, Vertex AI, RAG and the services underneath. M.Sc. from Musashino University, Japan.',
    href: 'https://github.com/schullegerhard',
    linkLabel: 'GitHub',
    photo: '/team/yuki-nakamura.jpg',
    accent: 'var(--cyan-light)',
    bg: 'rgba(52,208,232,0.14)',
  },
]

export function Founders() {
  return (
    <div className="mx-auto mt-10 grid max-w-[820px] gap-3.5 sm:grid-cols-2">
      {FOUNDERS.map((f) => (
        <div
          key={f.name}
          className="flex flex-col rounded-xl border border-border bg-surface p-5 text-left"
        >
          <div className="flex items-center gap-3">
            {f.photo ? (
              // alt is empty on purpose: the name sits right beside it, so a
              // described avatar would just read the person out twice.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={f.photo}
                alt=""
                width={40}
                height={40}
                loading="lazy"
                decoding="async"
                className="size-10 shrink-0 rounded-full object-cover"
                style={{ boxShadow: `0 0 0 1px ${f.bg}` }}
              />
            ) : (
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
                style={{ background: f.bg, color: f.accent }}
                aria-hidden="true"
              >
                {f.initials}
              </span>
            )}
            <div>
              <div className="text-[14.5px] font-semibold">{f.name}</div>
              <div className="text-[12px] text-foreground-tertiary">{f.role}</div>
            </div>
          </div>

          <p className="mt-3.5 text-[13px] leading-relaxed text-foreground-secondary">{f.bio}</p>

          <a
            href={f.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex items-center gap-1 pt-3.5 text-[12.5px] font-medium transition-opacity hover:opacity-80"
            style={{ color: f.accent }}
          >
            {f.linkLabel}
            <IconArrowRight size={13} />
            <span className="sr-only"> — {f.name} (opens in a new tab)</span>
          </a>
        </div>
      ))}
    </div>
  )
}
