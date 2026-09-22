'use client'

// ============================================================
// TASKPILOT — PHASE DECK
// apps/web/src/components/marketing/phase-deck.tsx
//
// "Three phases. One browser layer." rendered as a stacked, flippable deck
// on top of the shadcn <DisplayCard /> primitive.
//
// Two clicks, two different jobs — this is the whole interaction:
//   • Click a card that's BEHIND  -> the deck re-deals and that card comes
//     to the FRONT slot (full colour, highest z, accent glow).
//   • Click the card in FRONT     -> it FLIPS to its back face, which is a
//     live simulation of that phase actually doing its job.
//   Clicking the flipped card flips it back. Enter/Space do the same.
//
// The same deck renders at every breakpoint — skew, cascade, scrim and flip
// all intact on a phone; only the card size and the cascade offsets scale
// down. Nothing is hidden behind hover: the front card's whole pitch is on
// its face at rest, so a phone user who never taps still gets the argument,
// and tap does exactly what click does.
// ============================================================

import { useState, type CSSProperties } from 'react'
import { DisplayCard } from '@/components/ui/display-cards'
import { IconCheck } from '@/components/ui/icons'
import { PHASES } from './phases'
import { PhaseDemo, PhaseDemoStyles } from './phase-demos'

// Deck slot by depth-from-front. The front card sits at the origin and the
// rest cascade down-and-right behind it, so only their edges show and the
// active card's copy never competes with the text underneath it.
// Same deck at every size — only the geometry scales down. The mobile
// offsets are sized so the deepest card's right edge still clears the
// container: card width + 2 x offset has to fit the available width, or the
// stack pushes the document sideways.
const SLOTS = [
  'translate-x-0 translate-y-0 scale-100',
  'translate-x-[18px] translate-y-[15px] scale-[0.965] md:translate-x-[38px] md:translate-y-[30px]',
  'translate-x-[36px] translate-y-[30px] scale-[0.93] md:translate-x-[76px] md:translate-y-[60px]',
]

export function PhaseDeck() {
  const [active, setActive] = useState(PHASES.length - 1)
  const [flipped, setFlipped] = useState(false)

  // Depth 0 is the front of the deck. The active card always takes it; the
  // rest keep their relative order behind it.
  const depthOf = (i: number) => {
    if (i === active) return 0
    const behind = PHASES.map((_, n) => n).filter((n) => n !== active)
    return behind.indexOf(i) + 1
  }

  const handleClick = (i: number) => {
    if (i === active) setFlipped((f) => !f)
    else {
      setActive(i)
      setFlipped(false)
    }
  }

  return (
    <div className="mt-10">
      <PhaseDemoStyles />

      {/* Progression rail — Assist -> Understand -> Execute */}
      <div className="mb-7 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2">
        {PHASES.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2.5">
            <span
              className="flex items-center gap-[7px] text-[12px] font-medium uppercase tracking-wide transition-colors duration-200"
              style={{ color: i === active ? 'var(--foreground)' : 'var(--foreground-muted)' }}
            >
              <span
                className="size-[5px] rounded-full transition-all duration-200"
                style={{
                  background: i === active ? p.color : 'var(--foreground-muted)',
                  boxShadow: i === active ? `0 0 0 4px rgba(${p.rgb},0.18)` : 'none',
                }}
              />
              {p.progressionLabel}
            </span>
            {i < PHASES.length - 1 && (
              <span className="text-[12px] text-foreground-tertiary" aria-hidden="true">
                →
              </span>
            )}
          </div>
        ))}
      </div>

      {/* The deck */}
      <div
        className="grid min-h-[27rem] place-items-center [grid-template-areas:'stack'] md:min-h-[28rem]"
        role="group"
        aria-label="TaskPilot phases — select a card to bring it forward, then again to see it run"
      >
        {PHASES.map((phase, i) => {
          const depth = depthOf(i)
          const isFront = depth === 0
          const isFlipped = isFront && flipped

          return (
            <DisplayCard
              key={phase.id}
              flipped={isFlipped}
              zIndex={30 - depth * 10}
              onClick={() => handleClick(i)}
              fade={false}
              label={
                isFront
                  ? `${phase.title} — ${isFlipped ? 'hide' : 'show'} how it works`
                  : `${phase.title} — bring to front`
              }
              className={[
                '[grid-area:stack] duration-500',
                // 8deg (the registry default) is fine on short labels but
                // shears body copy badly; 5 keeps the deck readable.
                'h-[24rem] w-[16.5rem] -skew-y-[5deg]',
                'md:h-[19rem] md:w-[26rem]',
                SLOTS[depth] ?? SLOTS[SLOTS.length - 1],
                isFront ? 'grayscale-0' : 'grayscale',
              ].join(' ')}
              // --dc-accent is set on the outer element and inherits down to
              // the faces, so the accent border needs no extra prop.
              style={
                {
                  '--dc-accent': phase.color,
                  filter: isFront ? `drop-shadow(0 22px 45px rgba(${phase.rgb},0.22))` : undefined,
                } as CSSProperties
              }
              // Cards behind get a scrim over the face rather than a dimming
              // filter: it mutes their copy so it can't bleed through the gaps
              // as stray characters, while leaving the border and card shape
              // crisp. It lifts on hover to preview what's underneath.
              faceClassName={[
                isFront
                  ? 'border-[color:var(--dc-accent)]'
                  : // Applies at every size now that the cards overlap on
                    // mobile too, otherwise the copy underneath bleeds through.
                    "after:absolute after:inset-0 after:bg-background after:content-[''] " +
                    'after:transition-opacity after:duration-500 md:group-hover:after:opacity-0',
              ].join(' ')}
              front={<PhaseFront phase={phase} isFront={isFront} />}
              back={<PhaseBack phase={phase} />}
            />
          )
        })}
      </div>

      <p className="mt-7 text-center text-[12.5px] text-foreground-tertiary md:mt-10">
        Tap or click a card to bring it forward, then again to watch that phase run.
      </p>
    </div>
  )
}

function PhaseFront({ phase, isFront }: { phase: (typeof PHASES)[number]; isFront: boolean }) {
  return (
    <>
      <div className="w-full">
        <div className="flex w-full items-center gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: phase.bg, color: phase.color }}
          >
            {phase.icon}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-tertiary">
            {phase.eyebrowLabel}
          </span>
          <span
            className="ml-auto font-mono text-[22px] font-semibold leading-none opacity-40"
            style={{ color: phase.color }}
            aria-hidden="true"
          >
            {phase.number}
          </span>
        </div>

        <h3 className="mt-4 text-[19px] font-semibold tracking-[-0.01em]">{phase.title}</h3>
        <p className="mt-1.5 text-[14px] font-medium leading-snug text-foreground-secondary">
          {phase.tagline}
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-foreground-tertiary">
          {phase.description}
        </p>
      </div>

      <div className="w-full">
        <div className="flex flex-wrap gap-1.5">
          {phase.capabilities.map((c) => (
            <span
              key={c}
              className="rounded-full border border-border bg-background px-2 py-[3px] text-[10.5px] font-medium text-foreground-tertiary"
            >
              {c}
            </span>
          ))}
        </div>
        <span
          className="mt-2.5 block text-[11px] font-medium"
          style={{ color: isFront ? phase.color : 'var(--foreground-muted)' }}
        >
          {isFront ? 'See it run →' : 'Bring forward'}
        </span>
      </div>
    </>
  )
}

function PhaseBack({ phase }: { phase: (typeof PHASES)[number] }) {
  return (
    <>
      <div className="flex w-full items-center gap-2">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-md"
          style={{ background: phase.bg, color: phase.color }}
        >
          <span className="scale-[0.72]">{phase.icon}</span>
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-tertiary">
          {phase.title} — live
        </span>
        <span
          className="ml-auto size-1.5 animate-pulse rounded-full"
          style={{ background: phase.color }}
          aria-hidden="true"
        />
      </div>

      <div className="w-full rounded-lg border border-border bg-background p-2.5">
        <PhaseDemo id={phase.id} />
      </div>

      <div className="flex w-full items-center gap-1.5 text-[11px] font-medium text-foreground-tertiary">
        <IconCheck size={12} style={{ color: 'var(--success)' }} />
        {phase.capabilities[0]} · {phase.capabilities[phase.capabilities.length - 1]}
        <span className="ml-auto text-foreground-muted">Flip back</span>
      </div>
    </>
  )
}
