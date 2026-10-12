import { ArrowRight, CalendarCheck, FileText, Phone } from 'lucide-react'

const cards = [
  {
    icon: Phone,
    title: 'Missed or after-hours calls',
    body: 'A patient who can’t reach the clinic often calls somewhere else. Every unanswered ring is a visit that never reaches your schedule.',
  },
  {
    icon: CalendarCheck,
    title: 'Double-booking risk and schedule chaos',
    body: 'When bookings are taken from memory or notes, slots overlap and the day falls out of step with the doctor’s actual availability.',
  },
  {
    icon: FileText,
    title: 'Scattered follow-ups and records requests',
    body: 'Follow-up visits, reports and patient history end up across messages and paper, and your team spends time chasing them.',
  },
] as const

export default function Problem() {
  return (
    <section className="sec problem" id="problem">
      <div className="wrap">
        <div className="sec-head rv">
          <h2>Missed calls shouldn’t mean missed appointments.</h2>
          <p>
            Front desks are busy. Patients call after hours. Manual booking is slow, and
            confirmations get missed. Clinics need a reliable phone front desk that still respects
            the doctor’s real calendar.
          </p>
        </div>
        <div className="p-grid">
          {cards.map(({ icon: Icon, title, body }) => (
            <div className="card p-card rv" key={title}>
              <span className="ico">
                <Icon className="i" aria-hidden />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <div className="bridge rv">
          <ArrowRight className="i" style={{ width: 28, height: 28 }} aria-hidden />
          There is a calmer way to run the front desk: answer every call, and keep every booking
          tied to your real schedule.
        </div>
      </div>
    </section>
  )
}
