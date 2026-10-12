import { SIGN_UP_URL } from '../lib/app'

export default function FinalCTA() {
  return (
    <section className="final">
      <div className="wrap">
        <div className="final-box rv">
          <h2>Put an AI receptionist on your clinic line.</h2>
          <p>
            Answer calls, confirm visits with SMS OTP, and manage appointments, patients, and
            records in one place.
          </p>
          <div className="cta-row">
            <a href={SIGN_UP_URL} className="btn btn-white">
              Get started
            </a>
            <a href="#pricing" className="btn btn-ghost">
              View plans
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
