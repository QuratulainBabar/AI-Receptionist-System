import { Check, LayoutGrid, Phone } from 'lucide-react'

const phoneTicks = [
  'Answers clinic calls with doctor and clinic context',
  'Shares the consultation fee when configured',
  'Speaks only real open appointment times',
  'Detects existing active appointments by phone number',
  'Holds a slot, sends an OTP by SMS, and confirms after verification',
]

const portalTicks = [
  'Dashboard and appointment pipeline',
  'Patient list and patient files',
  'Reports, records, clinical notes and prescriptions',
  'Availability that powers the phone AI',
  'Team users, SMS preferences, Stripe plans and visit invoices',
]

export default function Solution() {
  return (
    <section className="sec solution" id="product">
      <div className="wrap">
        <div className="sec-head center rv">
          <h2>One system for the call and the clinic.</h2>
          <p>The phone agent handles the conversation. The portal holds everything that happens next.</p>
        </div>
        <div className="s-grid">
          <div className="card panel dark rv">
            <span className="ico">
              <Phone className="i" aria-hidden />
            </span>
            <h3>Phone AI Receptionist</h3>
            <p className="lead">
              A voice agent that answers on your clinic line and books like a careful front desk.
            </p>
            <ul className="ticks">
              {phoneTicks.map((t) => (
                <li key={t}>
                  <Check className="i" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <a href="#how" className="btn btn-white">
              Explore the product
            </a>
          </div>
          <div className="card panel rv">
            <span className="ico">
              <LayoutGrid className="i" aria-hidden />
            </span>
            <h3>Doctor Practice Portal</h3>
            <p className="lead">A single workspace for your doctors and front-desk team.</p>
            <ul className="ticks">
              {portalTicks.map((t) => (
                <li key={t}>
                  <Check className="i" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <a href="#showcase" className="btn btn-line">
              See the portal
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
