// ============================================================
// TASKPILOT — PHASE DATA
// apps/web/src/components/marketing/phases.tsx
//
// The single source of truth for "Three phases. One browser layer."
// The deck, the progression rail and the demos all render from this array —
// adding a Phase 4 means appending an entry here and a branch in
// <PhaseDemo />, not rewriting the section.
// ============================================================

import type { ReactNode } from 'react'
import { IconZap, IconSidebar, IconBot } from '@/components/ui/icons'

export type PhaseId = 'smart-paste' | 'ai-sidebar' | 'browser-actions'

export interface PhaseData {
  id: PhaseId
  number: string
  /** Assist -> Understand -> Execute: the escalation the section argues for. */
  progressionLabel: string
  eyebrowLabel: string
  title: string
  /** Front-of-card one-liner. The long pitch lives in `description`. */
  tagline: string
  description: string
  capabilities: string[]
  icon: ReactNode
  /** Accent used for the icon, the glow and the active rail dot. */
  color: string
  bg: string
  /** rgb triplet of `color`, for color-mix-free rgba() shadows. */
  rgb: string
}

export const PHASES: PhaseData[] = [
  {
    id: 'smart-paste',
    number: '01',
    progressionLabel: 'Assist',
    eyebrowLabel: 'Phase 01',
    title: 'Smart Paste',
    tagline: 'Copy anything. Press Alt+V. Every field fills itself.',
    description:
      "TaskPilot's 3-layer parser maps clipboard text to the right field with 95%+ accuracy across HubSpot, Salesforce, Gmail and 50+ apps.",
    capabilities: ['3-layer parsing', 'Field detection', 'Semantic mapping', '95%+ accuracy'],
    icon: <IconZap size={18} />,
    color: 'var(--indigo-light)',
    bg: 'rgba(109,118,245,0.12)',
    rgb: '109,118,245',
  },
  {
    id: 'ai-sidebar',
    number: '02',
    progressionLabel: 'Understand',
    eyebrowLabel: 'Phase 02',
    title: 'AI Sidebar',
    tagline: 'A copilot that reads the page you are actually on.',
    description:
      'Summarize, translate, extract emails and prices, draft replies, or export to Excel — without ever leaving the tab.',
    capabilities: ['Summarize', 'Translate', 'Extract', 'Export'],
    icon: <IconSidebar size={18} />,
    color: 'var(--cyan-light)',
    bg: 'rgba(52,208,232,0.1)',
    rgb: '52,208,232',
  },
  {
    id: 'browser-actions',
    number: '03',
    progressionLabel: 'Execute',
    eyebrowLabel: 'Phase 03',
    title: 'Browser Actions',
    tagline: 'Describe the outcome. TaskPilot does the clicking.',
    description:
      'Delegate whole workflows. TaskPilot plans the steps, runs them across tabs, verifies the result and reports back.',
    capabilities: ['Planning', 'Multi-step execution', 'Verification', 'Result reporting'],
    icon: <IconBot size={18} />,
    color: 'var(--violet)',
    bg: 'rgba(167,139,250,0.1)',
    rgb: '167,139,250',
  },
]
