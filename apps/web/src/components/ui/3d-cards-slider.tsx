'use client'

// ============================================================
// PARALLAX CARD CAROUSEL (3D cards slider)
// apps/web/src/components/ui/3d-cards-slider.tsx
//
// The registry component, ported to TypeScript with the fixes it needs to
// live inside a page rather than own one:
//
//   • Keyboard nav was bound to `window`, so the carousel swallowed
//     ArrowLeft/ArrowRight for the WHOLE page. Now scoped to the carousel,
//     and only while it has focus within.
//   • The track had no `overflow-hidden`, so absolutely-positioned cards
//     off to the sides pushed the document wide and produced horizontal
//     scroll on narrow screens.
//   • The outer wrapper was `min-h-screen` with its own gradient — page
//     chrome baked into a component. It's now a plain block that inherits
//     the section around it.
//   • Autoplay ignored prefers-reduced-motion, and didn't pause on
//     keyboard focus (only mouse hover), so a keyboard user could have the
//     card yanked out from under them mid-read.
//   • Card width is clamped to the container so the 320px default doesn't
//     overhang a 375px phone.
//
// `content` lets a caller replace the default title/description/button body
// with arbitrary nodes — that's how the TaskPilot use-case cards render
// real product content instead of the default stock-photo layout.
// ============================================================

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { LazyMotion, domAnimation, m } from 'framer-motion'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ParallaxCard {
  id: string | number
  title: string
  subtitle?: string
  description?: string
  imageUrl?: string
  actionLabel?: string
  onAction?: () => void
  /** Replaces the whole default body. Used for non-photo card content. */
  content?: ReactNode
  /** Per-card accent, applied to the border and glow when active. */
  accent?: string
}

export interface ParallaxCardCarouselProps {
  cards?: ParallaxCard[]
  autoplaySpeed?: number
  enableAutoplay?: boolean
  cardWidth?: number
  cardHeight?: number
  gap?: number
  perspective?: number
  maxRotation?: number
  className?: string
  /** Accessible name for the carousel region. */
  label?: string
}

export default function ParallaxCardCarousel({
  cards = [],
  autoplaySpeed = 5000,
  enableAutoplay = true,
  cardWidth = 320,
  cardHeight = 450,
  gap = 30,
  perspective = 1200,
  maxRotation = 25,
  className,
  label = 'Card carousel',
}: ParallaxCardCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(enableAutoplay)
  const [isPaused, setIsPaused] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const [width, setWidth] = useState(cardWidth)
  const carouselRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef(0)

  const count = cards.length
  const goToNext = useCallback(() => setActiveIndex((p) => (p + 1) % count), [count])
  const goToPrev = useCallback(() => setActiveIndex((p) => (p - 1 + count) % count), [count])

  // Clamp the card to whatever room the container actually has.
  useEffect(() => {
    const el = carouselRef.current
    if (!el) return
    const measure = () => setWidth(Math.min(cardWidth, el.clientWidth - 32))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [cardWidth])

  // Autoplay. Off entirely for prefers-reduced-motion, and paused whenever
  // the user is reading — pointer over it, or focus inside it.
  useEffect(() => {
    if (!isAutoPlaying || isPaused || count < 2) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const t = setTimeout(goToNext, autoplaySpeed)
    return () => clearTimeout(t)
  }, [activeIndex, isAutoPlaying, isPaused, autoplaySpeed, goToNext, count])

  // Scoped to the carousel — never steals the page's arrow keys.
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goToPrev()
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      goToNext()
    }
  }

  // Signed offset from the active card, wrapped the short way round.
  const offsetOf = (index: number) => {
    const distance = (index - activeIndex + count) % count
    return distance > count / 2 ? distance - count : distance
  }

  const getCardStyle = (index: number) => {
    const isActive = index === activeIndex
    const adjusted = offsetOf(index)
    const depth = Math.abs(adjusted)

    return {
      x: adjusted * (width + gap),
      scale: isActive ? 1 : 0.85 - Math.min(depth, 2) * 0.05,
      zIndex: count - depth,
      // Only the active card and its immediate neighbours are on stage.
      // Deeper cards are translucent, so while the deck slides they pass
      // over each other and their copy shows through — an unreadable
      // overlap on every autoplay transition. Hiding them fixes it at the
      // source rather than fighting it with opacity.
      opacity: depth === 0 ? 1 : depth === 1 ? 0.55 : 0,
      rotateY: isActive && isHovered ? -mousePosition.x * maxRotation : 0,
      rotateX: isActive && isHovered ? mousePosition.y * (maxRotation * 0.5) : 0,
    }
  }

  if (count === 0) return null

  return (
    <LazyMotion features={domAnimation} strict>
    <div className={cn('w-full', className)}>
      <div
        ref={carouselRef}
        className="relative mx-auto w-full overflow-hidden"
        style={{ perspective: `${perspective}px`, height: cardHeight + 84 }}
        onMouseMove={(e) => {
          const rect = carouselRef.current?.getBoundingClientRect()
          if (!rect) return
          setMousePosition({
            x: (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2),
            y: (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2),
          })
        }}
        onMouseEnter={() => {
          setIsHovered(true)
          setIsPaused(true)
        }}
        onMouseLeave={() => {
          setIsHovered(false)
          setIsPaused(false)
          setMousePosition({ x: 0, y: 0 })
        }}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={(e) => {
          if (!carouselRef.current?.contains(e.relatedTarget as Node)) setIsPaused(false)
        }}
        onTouchStart={(e) => {
          touchStartRef.current = e.touches[0].clientX
        }}
        onTouchEnd={(e) => {
          const diff = touchStartRef.current - e.changedTouches[0].clientX
          if (Math.abs(diff) > 50) (diff > 0 ? goToNext : goToPrev)()
        }}
        onKeyDown={handleKeyDown}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={-1}
      >
        <div
          className="relative flex items-center justify-center"
          style={{ height: cardHeight }}
        >
          {cards.map((card, index) => {
            const isActive = index === activeIndex
            const accent = card.accent ?? 'var(--border-strong)'

            return (
              <m.div
                key={card.id}
                className={cn(
                  'absolute cursor-pointer rounded-2xl',
                  // Off-stage cards are invisible; don't let them take clicks.
                  Math.abs(offsetOf(index)) >= 2 && 'pointer-events-none'
                )}
                initial={false}
                animate={getCardStyle(index)}
                transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 1 }}
                onClick={() => setActiveIndex(index)}
                style={{ width, height: cardHeight, transformStyle: 'preserve-3d' }}
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${count}: ${card.title}`}
                aria-hidden={!isActive}
                // Only the active card is reachable; the rest are decorative
                // until the user brings them forward.
                {...(isActive ? {} : { inert: '' as unknown as undefined })}
              >
                <div className="relative h-full w-full">
                  {/* Base layer — sits back on hover for the parallax offset. */}
                  <m.div
                    className="absolute inset-0 overflow-hidden rounded-2xl bg-muted"
                    animate={{
                      translateZ: isActive && isHovered ? -20 : 0,
                      translateX: isActive && isHovered ? -mousePosition.x * 10 : 0,
                      translateY: isActive && isHovered ? -mousePosition.y * 10 : 0,
                    }}
                  />

                  {/* Content layer — comes forward. */}
                  <m.div
                    className="absolute inset-0 z-10 flex flex-col justify-between p-6"
                    animate={{
                      translateZ: isActive && isHovered ? 30 : 0,
                      translateX: isActive && isHovered ? mousePosition.x * 15 : 0,
                      translateY: isActive && isHovered ? mousePosition.y * 15 : 0,
                    }}
                  >
                    {card.content ?? (
                      <>
                        <div>
                          <h3 className="mb-1 text-xl font-semibold text-foreground">{card.title}</h3>
                          {card.subtitle && (
                            <p className="text-sm text-foreground-tertiary">{card.subtitle}</p>
                          )}
                        </div>

                        {card.imageUrl && (
                          <div className="my-4 overflow-hidden rounded-lg">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={card.imageUrl}
                              alt=""
                              className="h-48 w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        )}

                        <div>
                          {card.description && (
                            <p className="mb-4 text-sm text-foreground-secondary">{card.description}</p>
                          )}
                          {card.actionLabel && (
                            <button
                              type="button"
                              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-transform duration-300 hover:scale-105"
                              style={{ background: accent }}
                              onClick={card.onAction}
                            >
                              {card.actionLabel}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </m.div>

                  {/* Border + glow. */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-2xl border transition-[border-color,box-shadow] duration-300"
                    style={{
                      borderColor: isActive ? accent : 'var(--border-subtle)',
                      boxShadow: isActive
                        ? `0 24px 50px -18px ${accent}, inset 0 0 0 1px rgba(255,255,255,0.04)`
                        : '0 4px 6px -1px rgba(0,0,0,0.3)',
                    }}
                  />
                </div>
              </m.div>
            )
          })}
        </div>

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 py-5">
          <CarouselButton onClick={goToPrev} label="Previous card">
            <ChevronLeft className="size-4" />
          </CarouselButton>

          <div className="flex items-center gap-2">
            {cards.map((card, index) => (
              <button
                key={card.id}
                type="button"
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  activeIndex === index
                    ? 'w-6 bg-foreground'
                    : 'w-2 bg-foreground-muted hover:bg-foreground-tertiary'
                )}
                onClick={() => setActiveIndex(index)}
                aria-label={`Go to ${card.title}`}
                aria-current={activeIndex === index}
              />
            ))}
          </div>

          <CarouselButton onClick={goToNext} label="Next card">
            <ChevronRight className="size-4" />
          </CarouselButton>

          <CarouselButton
            onClick={() => setIsAutoPlaying((p) => !p)}
            label={isAutoPlaying ? 'Pause autoplay' : 'Start autoplay'}
            active={isAutoPlaying}
          >
            {isAutoPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </CarouselButton>
        </div>
      </div>

      {/* Announce the active card to screen readers without moving focus. */}
      <span aria-live="polite" className="sr-only">
        {cards[activeIndex]?.title}, {activeIndex + 1} of {count}
      </span>
    </div>
    </LazyMotion>
  )
}

function CarouselButton({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void
  label: string
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-9 items-center justify-center rounded-full border border-border text-foreground-secondary',
        'backdrop-blur-md transition-colors duration-300 hover:bg-surface hover:text-foreground',
        active ? 'bg-surface' : 'bg-transparent'
      )}
    >
      {children}
    </button>
  )
}
