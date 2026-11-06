import { useEffect, useState } from "react"
import { SIGN_IN_URL, SIGN_UP_URL } from "../lib/app"

const NAV_LINKS = [
  { href: "#hero-banner", label: "Product" },
  { href: "#platform", label: "Platform" },
  { href: "#workflow", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeHref, setActiveHref] = useState("#hero-banner")

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const spy = () => {
      const y = window.scrollY + 120
      let current = NAV_LINKS[0].href
      for (const link of NAV_LINKS) {
        const section = document.querySelector<HTMLElement>(link.href)
        if (section && section.offsetTop <= y) current = link.href
      }
      setActiveHref(current)
    }
    window.addEventListener("scroll", spy, { passive: true })
    spy()
    return () => window.removeEventListener("scroll", spy)
  }, [])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <header className={`header${scrolled ? " scrolled" : ""}`} id="header">
      <div className="container">
        <nav className="navbar" id="navbar">
          <a href="#hero-banner" className="nav-logo" id="nav-logo" onClick={closeMenu}>
            <img
              src="/images/doctor-logo.png"
              alt="AI Receptionist Logo"
              className="logo-img logo-default"
            />
            <img
              src="/images/logo.png"
              alt="AI Receptionist Logo"
              className="logo-img logo-scrolled"
            />
            <span className="logo-text">AI Receptionist</span>
          </a>

          <div className={`nav-menu${menuOpen ? " active" : ""}`} id="nav-menu">
            <ul className="nav-links" id="nav-links">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className={`nav-link${activeHref === link.href ? " active" : ""}`}
                    onClick={closeMenu}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="nav-actions" id="nav-actions">
              <a href={SIGN_IN_URL} className="nav-signin" id="nav-signin">
                Sign in
              </a>
              <a href={SIGN_UP_URL} className="btn btn-primary nav-cta" id="nav-cta">
                Get started
              </a>
            </div>
          </div>

          <button
            type="button"
            className={`mobile-menu-toggle${menuOpen ? " active" : ""}`}
            id="mobile-menu-toggle"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="hamburger-line" />
            <span className="hamburger-line" />
            <span className="hamburger-line" />
          </button>
        </nav>
      </div>
    </header>
  )
}
