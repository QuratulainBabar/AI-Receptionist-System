import { SIGN_IN_URL, SIGN_UP_URL } from "../lib/app"

const FOOTER_LINKS = [
  { href: "#hero-banner", label: "Product" },
  { href: "#platform", label: "Platform" },
  { href: "#workflow", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: SIGN_IN_URL, label: "Sign in" },
  { href: SIGN_UP_URL, label: "Get started" },
] as const

export default function Footer() {
  return (
    <footer className="footer" id="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand" id="footer-brand">
            <a href="#hero-banner" className="footer-logo">
              <img src="/images/logo.png" alt="AI Receptionist Logo" className="footer-logo-img" />
              <span className="footer-logo-text">AI Receptionist</span>
            </a>
          </div>
          <nav className="footer-nav" id="footer-nav">
            {FOOTER_LINKS.map((link) => (
              <a href={link.href} className="footer-link" key={link.label}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className="footer-social" id="footer-social">
            <a href="#" className="footer-social-link" aria-label="LinkedIn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
            <a href="#" className="footer-social-link" aria-label="X">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.717-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
              </svg>
            </a>
            <a href="#" className="footer-social-link" aria-label="YouTube">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186 31.247 31.247 0 000 12.017c0 1.992.185 3.95.502 5.831a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136c.317-1.881.502-3.84.502-5.831 0-1.992-.185-3.95-.502-5.831zM9.545 15.568V8.466l6.273 3.551-6.273 3.551z" />
              </svg>
            </a>
          </div>
        </div>
        <div className="footer-bottom" id="footer-bottom">
          <p className="footer-copyright" id="footer-copyright">
            © 2026 AI Receptionist. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
