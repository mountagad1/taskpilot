'use client'

// Scroll-reveal wrapper — GPU-only (opacity/transform), respects
// prefers-reduced-motion via the .reveal rules in globals.css.

import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react'

export function Reveal({
  children,
  delay = 0,
  as: Tag = 'div',
  className = '',
  style,
}: {
  children: ReactNode
  delay?: 1 | 2 | 3 | 0
  as?: 'div' | 'section' | 'li'
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible')
          obs.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const cls = ['reveal', delay ? `reveal-d${delay}` : '', className].filter(Boolean).join(' ')
  // @ts-expect-error — dynamic tag with ref
  return <Tag ref={ref} className={cls} style={style}>{children}</Tag>
}
