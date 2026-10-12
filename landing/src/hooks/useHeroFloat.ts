import { useEffect } from 'react'

/** Parallax float for hero `.float[data-depth]` elements on scroll. */
export function useHeroFloat() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    const root = document.querySelector('.landing-root')
    const floats = Array.from((root ?? document).querySelectorAll<HTMLElement>('.float'))
    let ticking = false

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = Math.min(window.scrollY, 700)
        floats.forEach((el) => {
          const depth = parseFloat(el.dataset.depth || '0')
          el.style.transform = `translateY(${(y * depth) / 100}px)`
        })
        ticking = false
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
}
