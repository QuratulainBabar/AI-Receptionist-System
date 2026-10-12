import { useState } from 'react'
import { Plus } from 'lucide-react'

const faqs = [
  {
    q: 'What does the AI receptionist do on a phone call?',
    a: 'It answers your clinic line with your doctor and clinic profile in context, can share the consultation fee when configured, offers only real open appointment times, recognizes existing active appointments by phone number, and holds the slot while it sends a verification code.',
  },
  {
    q: 'How does appointment confirmation work?',
    a: 'After the caller picks a time, the slot is held and a 6-digit OTP is sent to them by SMS. The appointment is confirmed only after the code is verified.',
  },
  {
    q: 'Does it book from my real schedule?',
    a: 'Yes. The agent uses the availability you set in the portal, including your weekly schedule, specific dates and breaks, and slot lengths, and speaks only open times.',
  },
  {
    q: 'Can my clinic team use the portal too?',
    a: 'Yes. You can invite staff with role-based permissions: Receptionist, Clinic Administrator, Office Manager, Appointment Coordinator, Nurse / Clinical Assistant, Billing / Accounts, or Additional Doctor.',
  },
  {
    q: 'What happens after an appointment is confirmed?',
    a: 'It appears in your doctor portal with the patient’s context. You can manage its status, add clinical notes and prescriptions to the patient timeline, schedule a follow-up, and rely on automated SMS reminders.',
  },
  {
    q: 'Can I send reminders and follow-ups?',
    a: 'Yes. Appointment reminders are sent automatically by SMS at 3 days, 24 hours and 6 hours before the visit, and you can schedule follow-up appointments from the patient’s file.',
  },
  {
    q: 'How does billing work?',
    a: 'Clinic plans are billed monthly or yearly through Stripe. You can also send appointment invoice payment links to patients by SMS.',
  },
] as const

export default function FAQ() {
  const [open, setOpen] = useState<Record<number, boolean>>({})

  const toggle = (i: number) => {
    setOpen((prev) => ({ ...prev, [i]: !prev[i] }))
  }

  return (
    <section className="sec faq" id="faq">
      <div className="wrap faq-wrap">
        <div className="sec-head rv">
          <h2>Questions clinics ask</h2>
          <p>Straight answers about how the phone agent and the portal work.</p>
        </div>
        <div id="faqList">
          {faqs.map((item, i) => {
            const isOpen = !!open[i]
            return (
              <div className={`qa${isOpen ? ' open' : ''}`} key={item.q}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggle(i)}
                >
                  <span>{item.q}</span>
                  <span className="pm">
                    <Plus className="i" aria-hidden />
                  </span>
                </button>
                <div className="ans">
                  <div>
                    <p>{item.a}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
