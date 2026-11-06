import { useState } from "react"

const FAQS = [
  {
    q: "What does the AI receptionist actually do on a call?",
    a: "It handles inbound appointment conversations and can book against your real open availability, with SMS OTP verification before confirmation.",
  },
  {
    q: "Does it book random times or use my real calendar?",
    a: "Bookings use your availability calendar and open slots, not a fixed script of fake times.",
  },
  {
    q: "Who is this for, doctors or patients?",
    a: "Clinics and doctors are the primary customers. Patients get web access to find doctors, book, and manage history and records. Clinic staff can work in the doctor portal with permissions.",
  },
  {
    q: "What's the difference between Starter and Growth?",
    a: "Starter covers phone booking, OTP, reminders, dashboard, appointments, patients, and basic records. Growth adds follow-ups, patient timeline, SMS record requests, Stripe invoice links, team users, richer notifications, and My Clinic phone AI configuration.",
  },
  {
    q: "Can we send appointment reminders and confirmations by email?",
    a: "Yes, automated SMS appointment reminders are included on all plans. You control what your clinic sends and when reminders go out before visits.",
  },
] as const

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="faq-section" id="faq">
      <div className="container">
        <div className="faq-header" id="faq-header">
          <h2 className="section-title section-title-lg">Questions clinics ask before switching</h2>
          <p className="section-description">Straight answers about how AI Receptionist works.</p>
        </div>
        <div className="faq-list" id="faq-list">
          {FAQS.map((item, index) => {
            const open = openIndex === index
            return (
              <div
                className={`faq-item${open ? " active" : ""}`}
                id={`faq-item-${index + 1}`}
                key={item.q}
              >
                <button
                  type="button"
                  className="faq-question"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                >
                  <span>{item.q}</span>
                  <span className="faq-icon">+</span>
                </button>
                <div className="faq-answer">
                  <p>{item.a}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
