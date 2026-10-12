import { useEffect } from 'react'

/** Adds `.in` to elements with `.rv` when they enter the viewport. */
export function useReveal() {
  useEffect(() => {
    const root = document.querySelector('.landing-root')
    const elements = Array.from((root ?? document).querySelectorAll<HTMLElement>('.rv'))

    if (!('IntersectionObserver' in window)) {
      elements.forEach((el) => el.classList.add('in'))
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )

    elements.forEach((el, i) => {
      el.style.transitionDelay = `${(i % 4) * 60}ms`
      io.observe(el)
    })

    return () => io.disconnect()
  }, [])
}
