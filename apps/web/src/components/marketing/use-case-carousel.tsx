'use client'

// ============================================================
// TASKPILOT — USE CASE CAROUSEL
// apps/web/src/components/marketing/use-case-carousel.tsx
//
// "Who is this actually for?" — the question the landing page never
// answered. Features explain what TaskPilot does; this explains the job it
// gets done, per role, so a visitor can find themselves on the page.
//
// Built on the registry <ParallaxCardCarousel />. Cards render custom
// `content` rather than the primitive's stock-photo body: a photo of a
// forest tells a prospective SDR nothing, whereas the concrete workflow
// ("paste a LinkedIn profile, get a filled HubSpot contact") is the pitch.
// ============================================================

import type { ReactNode } from 'react'
import ParallaxCardCarousel, { type ParallaxCard } from '@/components/ui/3d-cards-slider'
import {
  IconZap,
  IconSidebar,
  IconBot,
  IconTable,
  IconMessage,
  IconCheck,
} from '@/components/ui/icons'

interface UseCase {
  id: string
  role: string
  title: string
  description: string
  steps: string[]
  phase: string
  icon: ReactNode
  accent: string
  bg: string
}

const USE_CASES: UseCase[] = [
  {
    id: 'sales',
    role: 'Sales & SDR',
    title: 'Stop retyping leads',
    description:
      'Copy a prospect from LinkedIn, a signature or a spreadsheet row, and land a complete CRM contact without touching a single field.',
    steps: ['Copy any prospect blob', 'Alt+V on the CRM form', 'Every field mapped and checked'],
    phase: 'Smart Paste',
    icon: <IconZap size={17} />,
    accent: 'var(--indigo-light)',
    bg: 'rgba(109,118,245,0.12)',
  },
  {
    id: 'recruiting',
    role: 'Recruiting & HR',
    title: 'Screen candidates faster',
    description:
      'Pull structured detail out of a résumé or profile page, summarise it against your role brief, and push it into your ATS.',
    steps: ['Open any candidate page', 'Ask the sidebar to summarise', 'Export the shortlist to Excel'],
    phase: 'AI Sidebar',
    icon: <IconSidebar size={17} />,
    accent: 'var(--cyan-light)',
    bg: 'rgba(52,208,232,0.1)',
  },
  {
    id: 'research',
    role: 'Research & Analysis',
    title: 'Turn pages into data',
    description:
      'Any list, table or directory becomes a clean spreadsheet — no scraper to write, no selector to maintain when the page changes.',
    steps: ['Point at a list or table', 'Pick the columns you want', 'Export to CSV, Excel or Notion'],
    phase: 'Extract & Export',
    icon: <IconTable size={17} />,
    accent: '#6ee7a8',
    bg: 'rgba(34,197,94,0.12)',
  },
  {
    id: 'ecommerce',
    role: 'E-commerce & Ops',
    title: 'Watch catalogs and prices',
    description:
      'Track competitor SKUs, pull pricing off category pages and keep a running sheet — as a repeatable action instead of an afternoon.',
    steps: ['Describe what to collect', 'TaskPilot walks the pages', 'Results land in one sheet'],
    phase: 'Browser Actions',
    icon: <IconBot size={17} />,
    accent: 'var(--violet)',
    bg: 'rgba(167,139,250,0.1)',
  },
  {
    id: 'support',
    role: 'Support & Success',
    title: 'Reply with context',
    description:
      'The sidebar already sees the ticket, the order and the thread. Draft a reply that references them, in the tone your team uses.',
    steps: ['Open the ticket', 'Ask for a draft reply', 'Edit and send — never blank-page it'],
    phase: 'AI Sidebar',
    icon: <IconMessage size={17} />,
    accent: 'var(--cyan-light)',
    bg: 'rgba(52,208,232,0.1)',
  },
]

const CARDS: ParallaxCard[] = USE_CASES.map((u) => ({
  id: u.id,
  title: `${u.role}: ${u.title}`,
  accent: u.accent,
  content: <UseCaseCardBody useCase={u} />,
}))

export function UseCaseCarousel() {
  return (
    <ParallaxCardCarousel
      cards={CARDS}
      label="TaskPilot use cases by role"
      cardWidth={330}
      cardHeight={400}
      gap={26}
      maxRotation={16}
      autoplaySpeed={6000}
    />
  )
}

function UseCaseCardBody({ useCase }: { useCase: UseCase }) {
  return (
    <>
      <div>
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: useCase.bg, color: useCase.accent }}
          >
            {useCase.icon}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-tertiary">
            {useCase.role}
          </span>
        </div>

        <h3 className="mt-4 text-[20px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
          {useCase.title}
        </h3>
        <p className="mt-2.5 text-[13px] leading-relaxed text-foreground-secondary">
          {useCase.description}
        </p>
      </div>

      <div>
        <ul className="mb-4 space-y-2">
          {useCase.steps.map((s) => (
            <li key={s} className="flex items-start gap-2 text-[12.5px] text-foreground-tertiary">
              <IconCheck
                size={13}
                className="mt-[3px] shrink-0"
                style={{ color: useCase.accent }}
              />
              {s}
            </li>
          ))}
        </ul>
        <span
          className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10.5px] font-medium"
          style={{
            color: useCase.accent,
            borderColor: useCase.bg,
            background: useCase.bg,
          }}
        >
          Powered by {useCase.phase}
        </span>
      </div>
    </>
  )
}
