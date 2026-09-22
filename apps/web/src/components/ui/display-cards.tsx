'use client'

// ============================================================
// DISPLAY CARDS
// apps/web/src/components/ui/display-cards.tsx
//
// The stacked, skewed card deck from the shadcn registry, extended with two
// things the upstream version doesn't have and that the TaskPilot "How it
// works" section needs:
//
//   1. A BACK FACE  — pass `back` and the card becomes a real 3D flip card.
//   2. DEPTH CONTROL — pass `zIndex` so a clicked card can be pulled in
//      front of the rest of the deck instead of staying where it was dealt.
//
// Structure (why it's three nested elements and not one div):
//   outer  — takes `className`, owns the deck POSITION (grid-area, translate,
//            skew, size), the perspective, and the grayscale/overlay state.
//   flip   — owns only `rotateY`, so the flip animates independently of the
//            deck transforms. Mixing them on one element makes the skew
//            shear the card mid-rotation.
//   faces  — front + back, absolutely stacked, backface-visibility: hidden.
//
// Every className in the upstream default deck (grid-area / translate /
// grayscale / before: overlay) is positional, so routing `className` to the
// outer element keeps the original deck rendering identical. Card chrome
// (border, bg-muted, rounded-xl) lives on the faces. `cn` uses tailwind-merge,
// so callers can still override size/skew from `className`.
// ============================================================

import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DisplayCardProps {
  className?: string
  icon?: ReactNode
  title?: string
  description?: string
  date?: string
  iconClassName?: string
  titleClassName?: string
  /** Replaces the default title/description/date front face entirely. */
  front?: ReactNode
  /** Back face. Supplying it is what makes the card flippable. */
  back?: ReactNode
  /** Controlled flip state. The parent owns it so only one card flips at a time. */
  flipped?: boolean
  /** Stacking order within the deck — the clicked card gets the highest value. */
  zIndex?: number
  /** Makes the card activatable by mouse, Enter and Space. */
  onClick?: () => void
  /** Accessible name, used when the card is interactive. */
  label?: string
  /** Upstream's right-edge gradient fade. Off when the face holds real content. */
  fade?: boolean
  /** Applied to both faces — where the card chrome lives (border, bg, radius). */
  faceClassName?: string
  style?: CSSProperties
}

// `bg-muted` is deliberately NOT written as upstream's `bg-muted/70`: Tailwind
// can't apply an opacity modifier to a color defined as a bare var(), so it
// silently emits no declaration at all and the face renders fully transparent.
// Stacked cards need an opaque fill regardless — the translucent look comes
// from the token itself sitting just above --background.
const FACE =
  'absolute inset-0 flex flex-col justify-between overflow-hidden rounded-xl border-2 border-border ' +
  'bg-muted px-4 py-3 backdrop-blur-sm [backface-visibility:hidden] ' +
  '[-webkit-backface-visibility:hidden] transition-colors duration-700 ' +
  'group-hover:border-white/20'

export function DisplayCard({
  className,
  icon = <Sparkles className="size-4 text-blue-300" />,
  title = 'Featured',
  description = 'Discover amazing content',
  date = 'Just now',
  iconClassName = 'text-blue-500',
  titleClassName = 'text-blue-500',
  front,
  back,
  flipped = false,
  zIndex,
  onClick,
  label,
  fade = true,
  faceClassName,
  style,
}: DisplayCardProps) {
  const interactive = typeof onClick === 'function'

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick!()
    }
  }

  const defaultFront = (
    <>
      <div>
        <span className={cn('relative inline-block rounded-full bg-blue-800 p-1', iconClassName)}>
          {icon}
        </span>
        <p className={cn('text-lg font-medium', titleClassName)}>{title}</p>
      </div>
      <p className="whitespace-nowrap text-lg">{description}</p>
      <p className="text-muted-foreground">{date}</p>
    </>
  )

  return (
    <div
      className={cn(
        // perspective lives here, preserve-3d lives on the rotating child —
        // keeping them on separate elements is what lets the deck's skew and
        // translate coexist with the flip without shearing it.
        'group relative h-36 w-[22rem] -skew-y-[8deg] select-none [perspective:1600px]',
        'transition-all duration-700',
        interactive && 'cursor-pointer',
        className
      )}
      style={{ ...style, zIndex }}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? label : undefined}
      aria-pressed={interactive && back ? flipped : undefined}
    >
      <div
        className={cn(
          'relative h-full w-full transition-transform duration-700 [transform-style:preserve-3d]',
          'motion-reduce:transition-none',
          flipped && back && '[transform:rotateY(180deg)]'
        )}
      >
        {/* Front */}
        <div
          className={cn(
            FACE,
            faceClassName,
            !front && '[&>*]:flex [&>*]:items-center [&>*]:gap-2',
            fade &&
              "after:absolute after:-right-1 after:top-[-5%] after:h-[110%] after:w-[20rem] " +
                "after:bg-gradient-to-l after:from-background after:to-transparent after:content-['']"
          )}
        >
          {front ?? defaultFront}
        </div>

        {/* Back — only rendered when there is something to flip to. */}
        {back && (
          <div
            className={cn(FACE, faceClassName, '[transform:rotateY(180deg)]')}
            aria-hidden={!flipped}
          >
            {back}
          </div>
        )}
      </div>
    </div>
  )
}

export interface DisplayCardsProps {
  cards?: DisplayCardProps[]
  className?: string
}

export default function DisplayCards({ cards, className }: DisplayCardsProps) {
  const defaultCards: DisplayCardProps[] = [
    {
      className:
        "[grid-area:stack] hover:-translate-y-10 before:absolute before:w-[100%] before:outline-1 before:rounded-xl before:outline-border before:h-[100%] before:content-[''] before:bg-blend-overlay before:bg-background/50 grayscale-[100%] hover:before:opacity-0 before:transition-opacity before:duration-700 hover:grayscale-0 before:left-0 before:top-0",
    },
    {
      className:
        "[grid-area:stack] translate-x-16 translate-y-10 hover:-translate-y-1 before:absolute before:w-[100%] before:outline-1 before:rounded-xl before:outline-border before:h-[100%] before:content-[''] before:bg-blend-overlay before:bg-background/50 grayscale-[100%] hover:before:opacity-0 before:transition-opacity before:duration-700 hover:grayscale-0 before:left-0 before:top-0",
    },
    {
      className: '[grid-area:stack] translate-x-32 translate-y-20 hover:translate-y-10',
    },
  ]

  const displayCards = cards ?? defaultCards

  return (
    <div className={cn("grid [grid-template-areas:'stack'] place-items-center", className)}>
      {displayCards.map((cardProps, index) => (
        <DisplayCard key={index} {...cardProps} />
      ))}
    </div>
  )
}
