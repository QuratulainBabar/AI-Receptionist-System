import { ArrowRight } from "lucide-react"
import { SIGN_UP_URL } from "../lib/app"

export default function Hero() {
  return (
    <>
      <section className="hero-banner" id="hero-banner">
        <div className="container">
          <div className="hero-banner-content">
            <h1 className="hero-banner-title">
              AI phone receptionist
              <br />
              for modern clinics
            </h1>
            <p className="hero-banner-description">
              Answer patient calls, book from your real availability, and confirm visits with email OTP
              all managed through your doctor portal.
            </p>
            <div className="hero-banner-actions">
              <a href={SIGN_UP_URL} className="btn btn-hero-primary">
                Get started
                <ArrowRight size={18} aria-hidden />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="hero-laptop" id="hero-laptop">
        <div className="container">
          <img
            src="/images/laptop.png"
            alt="AI Receptionist on a laptop"
            className="hero-laptop-img"
            id="hero-laptop-img"
          />
        </div>
      </section>
    </>
  )
}
