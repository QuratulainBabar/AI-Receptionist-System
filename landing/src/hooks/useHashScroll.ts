import { useEffect } from 'react'

/** Scroll to hash target after mount (needed when arriving from another origin). */
export function useHashScroll() {
  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.replace(/^#/, '')
      if (!id) return
      const el = document.getElementById(id)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    // Wait a frame so sections are laid out after React paint.
    const t0 = window.setTimeout(scrollToHash, 0)
    const t1 = window.setTimeout(scrollToHash, 120)
    window.addEventListener('hashchange', scrollToHash)
    return () => {
      window.clearTimeout(t0)
      window.clearTimeout(t1)
      window.removeEventListener('hashchange', scrollToHash)
    }
  }, [])
}
