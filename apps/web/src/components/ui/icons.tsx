// ============================================================
// TASKPILOT — ICON SET
// Consistent Lucide-style stroke icons (1.5px, round caps).
// No emoji anywhere in the UI.
// ============================================================

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 18, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconZap = (p: IconProps) => (
  <Base {...p}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" /></Base>
)
export const IconSidebar = (p: IconProps) => (
  <Base {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" /></Base>
)
export const IconBot = (p: IconProps) => (
  <Base {...p}><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 8V5M9 4h6M9 14h.01M15 14h.01" /></Base>
)
export const IconTable = (p: IconProps) => (
  <Base {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></Base>
)
export const IconMail = (p: IconProps) => (
  <Base {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Base>
)
export const IconMessage = (p: IconProps) => (
  <Base {...p}><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" /></Base>
)
export const IconGlobe = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" /></Base>
)
export const IconGauge = (p: IconProps) => (
  <Base {...p}><path d="M12 14 15 9M20 16a8 8 0 1 0-16 0Z" /></Base>
)
export const IconWorkflow = (p: IconProps) => (
  <Base {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><path d="M10 6.5h4a3 3 0 0 1 3 3V14" /></Base>
)
export const IconChart = (p: IconProps) => (
  <Base {...p}><path d="M3 3v18h18M8 15v3M13 10v8M18 6v12" /></Base>
)
export const IconPlug = (p: IconProps) => (
  <Base {...p}><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0Z M12 17v5" /></Base>
)
export const IconSettings = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.6 15H4.5a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V4.5a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.1a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></Base>
)
export const IconSparkles = (p: IconProps) => (
  <Base {...p}><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></Base>
)
export const IconArrowRight = (p: IconProps) => (
  <Base {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Base>
)
export const IconCheck = (p: IconProps) => (
  <Base {...p}><path d="m5 12 5 5L20 7" /></Base>
)
export const IconChrome = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.2" /><path d="M12 8.8h8.2M8 14l-4.1-7M14.9 15l-4 7" /></Base>
)
export const IconPlay = (p: IconProps) => (
  <Base {...p}><path d="M7 4.5v15l12-7.5-12-7.5Z" /></Base>
)
export const IconLock = (p: IconProps) => (
  <Base {...p}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Base>
)
export const IconStar = (p: IconProps) => (
  <Base {...p}><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" fill="currentColor" stroke="none" /></Base>
)
export const IconX = (p: IconProps) => (
  <Base {...p}><path d="M6 6l12 12M18 6 6 18" /></Base>
)
export const IconMenu = (p: IconProps) => (
  <Base {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Base>
)
export const IconDownload = (p: IconProps) => (
  <Base {...p}><path d="M12 3v12M7 11l5 5 5-5M5 21h14" /></Base>
)
export const IconLogout = (p: IconProps) => (
  <Base {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Base>
)
export const IconCrown = (p: IconProps) => (
  <Base {...p}><path d="M3 7l4.5 4L12 5l4.5 6L21 7l-1.5 12h-15L3 7Z" /></Base>
)
export const IconGrid = (p: IconProps) => (
  <Base {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Base>
)
export const IconChevronRight = (p: IconProps) => (
  <Base {...p}><path d="m9 6 6 6-6 6" /></Base>
)
export const IconClipboard = (p: IconProps) => (
  <Base {...p}><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /></Base>
)
export const IconLogo = (p: IconProps) => (
  <Base {...p}><path d="M12 2.5 14 9l6.5 2-6.5 2-2 6.5-2-6.5L3.5 11 10 9l2-6.5Z" fill="currentColor" stroke="none" /></Base>
)
