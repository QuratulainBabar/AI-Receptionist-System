import { Check } from 'lucide-react'

export default function Stories() {
  return (
    <section className="sec" id="stories">
      <div className="wrap">
        <div className="story">
          <div className="s-copy rv">
            <h3>Phone AI that books like your front desk</h3>
            <p>
              Callers get a clear, helpful conversation, and your calendar stays exactly as you set
              it.
            </p>
            <ul className="ticks">
              <li>
                <Check className="i" aria-hidden />
                Checks availability and offers only open times
              </li>
              <li>
                <Check className="i" aria-hidden />
                Recognizes existing active appointments by phone number
              </li>
              <li>
                <Check className="i" aria-hidden />
                Confirms the visit after the caller verifies their SMS OTP
              </li>
              <li>
                <Check className="i" aria-hidden />
                Set greeting, language and voice in My Clinic
              </li>
            </ul>
          </div>
          <div className="s-vis rv">
            <div className="mock">
              <div className="m-top">
                <i />
                <i />
                <i />
                <span>My Clinic · Agent settings</span>
              </div>
              <div className="m-main">
                <div className="field">
                  <label>Agent greeting</label>
                  <div className="input" style={{ minHeight: 70 }}>
                    Thank you for calling. I’m the clinic’s AI receptionist. How can I help you
                    today?
                  </div>
                </div>
                <div className="field">
                  <label>Languages</label>
                  <div className="lang">
                    <span className="on">English</span>
                    <span>Urdu</span>
                    <span>Hindi</span>
                    <span>Arabic</span>
                    <span>Spanish</span>
                    <span>French</span>
                    <span>German</span>
                  </div>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Voice</label>
                  <div className="input">Calm · Female</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="story rev">
          <div className="s-copy rv">
            <h3>A complete appointment and patient workspace</h3>
            <p>
              From the moment a booking lands to the follow-up visit, everything stays attached to
              the patient.
            </p>
            <ul className="ticks">
              <li>
                <Check className="i" aria-hidden />
                Move visits through every status, and schedule follow-ups
              </li>
              <li>
                <Check className="i" aria-hidden />
                Keep history, reports, clinical notes and prescriptions on one timeline
              </li>
              <li>
                <Check className="i" aria-hidden />
                Request records from patients with an SMS upload link
              </li>
              <li>
                <Check className="i" aria-hidden />
                Follow activity history and notifications as they happen
              </li>
            </ul>
          </div>
          <div className="s-vis rv">
            <div className="mock">
              <div className="m-top">
                <i />
                <i />
                <i />
                <span>Patient file · Timeline</span>
              </div>
              <div className="m-main">
                <div className="m-h" style={{ marginBottom: 14 }}>
                  <div className="m-who">
                    <span className="m-av">PS</span>
                    <div>
                      <strong>Priya Shah</strong>
                      <span>Blood pressure review</span>
                    </div>
                  </div>
                  <span className="chip fu">Follow-up</span>
                </div>
                <div className="tl">
                  <div>
                    <strong>Records requested</strong>{' '}
                    <span className="m-muted">· SMS link sent</span>
                  </div>
                  <div>
                    <strong>Clinical note added</strong>
                    <div className="box">Readings stable. Continue current plan.</div>
                  </div>
                  <div>
                    <strong>Follow-up booked</strong>{' '}
                    <span className="m-muted">· Reminders scheduled</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="story">
          <div className="s-copy rv">
            <h3>Billing that fits clinic operations</h3>
            <p>
              Plans and patient payments run through Stripe, with simple management inside the
              portal.
            </p>
            <ul className="ticks">
              <li>
                <Check className="i" aria-hidden />
                Subscribe to a clinic plan with Stripe checkout
              </li>
              <li>
                <Check className="i" aria-hidden />
                Send appointment invoice payment links by SMS
              </li>
              <li>
                <Check className="i" aria-hidden />
                Review and manage your plan from the Plans page
              </li>
            </ul>
          </div>
          <div className="s-vis rv">
            <div className="mock">
              <div className="m-top">
                <i />
                <i />
                <i />
                <span>Appointment · Invoice</span>
              </div>
              <div className="m-main">
                <div className="m-h">
                  <div>
                    <h4>Visit invoice</h4>
                    <span className="m-muted">Daniel Kim · Today 11:00</span>
                  </div>
                  <span className="chip pending">Awaiting payment</span>
                </div>
                <div className="m-list" style={{ marginBottom: 14 }}>
                  <div className="m-row" style={{ gridTemplateColumns: '1fr auto' }}>
                    <span>Consultation</span>
                    <strong>Set in your profile</strong>
                  </div>
                  <div className="m-row" style={{ gridTemplateColumns: '1fr auto' }}>
                    <span>Payment link</span>
                    <span className="chip new">Sent by SMS</span>
                  </div>
                </div>
                <span className="m-btn">Send payment link</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
