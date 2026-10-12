import { useEffect, useState } from 'react'
import { Activity, Menu, X } from 'lucide-react'
import { SIGN_IN_URL, SIGN_UP_URL } from '../lib/app'

const NAV_LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
] as const

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeHref, setActiveHref] = useState('#product')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const sections = NAV_LINKS.map((l) => document.querySelector<HTMLElement>(l.href))
    const spy = () => {
      const y = window.scrollY + 140
      let cur = 0
      sections.forEach((s, i) => {
        if (s && s.offsetTop <= y) cur = i
      })
      setActiveHref(NAV_LINKS[cur].href)
    }
    window.addEventListener('scroll', spy, { passive: true })
    spy()
    return () => window.removeEventListener('scroll', spy)
  }, [])

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerOpen) setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const closeDrawer = () => setDrawerOpen(false)

  return (
    <>
      <header className={`nav${scrolled ? ' scrolled' : ''}`} id="nav">
        <div className="wrap bar">
          <a href="#top" className="brand" aria-label="AI Receptionist home">
            <span className="mark">
              <Activity aria-hidden />
            </span>
            AI Receptionist
          </a>
          <nav className="links" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={activeHref === link.href ? 'active' : undefined}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="nav-cta">
            <a href={SIGN_IN_URL} className="signin">
              Sign in
            </a>
            <a href={SIGN_UP_URL} className="btn">
              Get started
            </a>
            <button
              className="burger"
              type="button"
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              aria-controls="drawer"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="i" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <div className={`drawer${drawerOpen ? ' open' : ''}`} id="drawer" aria-hidden={!drawerOpen}>
        <div className="top">
          <span className="brand">
            <span className="mark">
              <Activity aria-hidden />
            </span>
            AI Receptionist
          </span>
          <button className="x-btn" type="button" aria-label="Close menu" onClick={closeDrawer}>
            <X className="i" aria-hidden />
          </button>
        </div>
        <nav aria-label="Mobile">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={closeDrawer}>
              {link.label}
            </a>
          ))}
          <a href={SIGN_IN_URL} onClick={closeDrawer}>
            Sign in
          </a>
        </nav>
        <a href={SIGN_UP_URL} className="btn" onClick={closeDrawer}>
          Get started
        </a>
      </div>
    </>
  )
}
