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

import { useEffect, useRef, useState, type CSSProperties } from 'react'
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
// Unpinned scroll-driving: the slice of the deck's pass through the viewport
// over which the three cards are dealt. Starting at 0.28 and spanning 0.44
// keeps every switch inside the stretch where the deck is actually readable.
const WINDOW_START = 0.28
const WINDOW_SPAN = 0.44

const SLOTS = [
  'translate-x-0 translate-y-0 scale-100',
  'translate-x-[18px] translate-y-[15px] scale-[0.965] md:translate-x-[38px] md:translate-y-[30px]',
  'translate-x-[36px] translate-y-[30px] scale-[0.93] md:translate-x-[76px] md:translate-y-[60px]',
]

export function PhaseDeck() {
  // Starts on Phase 01 — scrolling walks the deck forward to 03.
  const [active, setActive] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  // The last index scrolling itself produced. Compared against this rather
  // than against `active`, so a card picked by hand stays put until the
  // scroll actually crosses into a different band instead of being yanked
  // back by the next stray wheel event.
  const lastScrollIndex = useRef(0)

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    // Same gate as the CSS below. PINNING is md+ only: the panel is a fixed
    // ~836px tall on a phone, which only clears an 844px viewport — and
    // mobile browser chrome shrinks that as you scroll, so the bottom of the
    // card would be pinned out of reach. The scroll-driven card switching
    // itself runs everywhere; only how progress is measured differs.
    const pinned = window.matchMedia('(min-width: 768px)')
    const enabled = () => !reduced.matches

    let raf = 0
    const sync = () => {
      raf = 0
      let progress: number

      if (pinned.matches) {
        // Pinned: progress is how far through the tall track we've scrolled.
        const distance = el.offsetHeight - window.innerHeight
        if (distance <= 0) return
        progress = -el.getBoundingClientRect().top / distance
      } else {
        // Unpinned (phones): the deck still advances, driven by its own
        // travel up the viewport instead of by a pinned track. Nothing is
        // held in place, so nothing can end up stranded off-screen.
        const r = el.getBoundingClientRect()
        const vh = window.innerHeight
        // 0 when the deck's top reaches the bottom of the screen, 1 when its
        // bottom leaves the top.
        const travel = (vh - r.top) / (vh + r.height)
        // Spend the switches on the middle of that pass, so cards don't flip
        // while the deck is half off-screen at either end.
        progress = (travel - WINDOW_START) / WINDOW_SPAN
      }

      const i = Math.min(
        PHASES.length - 1,
        Math.max(0, Math.floor(progress * PHASES.length))
      )
      if (i !== lastScrollIndex.current) {
        lastScrollIndex.current = i
        setActive(i)
        setFlipped(false)
      }
    }
    const onScroll = () => {
      if (enabled() && !raf) raf = requestAnimationFrame(sync)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    pinned.addEventListener('change', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      pinned.removeEventListener('change', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

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
    // Tall track + pinned panel: scrolling its length is what advances the
    // deck. 220vh leaves ~40vh of travel per phase — enough to feel
    // deliberate without holding the page hostage for three full screens.
    // Under reduced motion the track collapses and the panel un-pins, so
    // the section behaves like any other.
    <div
      ref={trackRef}
      className="relative mt-10 md:h-[220vh] md:motion-reduce:h-auto"
    >
      <PhaseDemoStyles />
      <div className="flex flex-col justify-center md:sticky md:top-0 md:min-h-screen md:pt-[var(--nav-height)] md:motion-reduce:static md:motion-reduce:min-h-0 md:motion-reduce:pt-0">
        <div className="mx-auto mb-8 max-w-[620px] text-center">
          <span className="eyebrow">How it works</span>
          <h2 className="mt-4 text-[clamp(26px,3.4vw,38px)] font-semibold tracking-[-0.025em]">
            Three phases. One browser layer.
          </h2>
          <p className="mt-3.5 text-[16px] leading-relaxed text-foreground-secondary">
            From instant form-fill to full automation — TaskPilot works in layers, each more
            capable than the last.
          </p>
        </div>

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
          Scroll through the phases — or tap any card to watch it run.
        </p>
      </div>
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
