import { SIGN_UP_URL } from "../lib/app"

export default function FinalCTA() {
  return (
    <section className="cta-section" id="cta">
      <div className="container">
        <div className="cta-card" id="cta-card">
          <h2 className="cta-title">Put an AI receptionist on your clinic line</h2>
          <p className="cta-description">
            Book from real availability, confirm with email OTP, and run appointments, patients, and
            billing from one portal.
          </p>
          <div className="cta-actions">
            <a href={SIGN_UP_URL} className="btn btn-primary btn-cta" id="cta-getstarted">
              Get started
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
