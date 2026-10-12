import { CreditCard, Phone, User, Users } from 'lucide-react'

const cards = [
  {
    icon: User,
    title: 'Solo doctors',
    body: 'Let the phone agent handle bookings while you see patients, then review everything in one portal.',
  },
  {
    icon: Users,
    title: 'Multi-staff clinics',
    body: 'Invite additional doctors and staff with role-based permissions, and keep activity history in view.',
  },
  {
    icon: Phone,
    title: 'Front-desk and receptionist teams',
    body: 'Spend less time on repeat booking calls and more on patients in the room. Receptionists and appointment coordinators can be invited.',
  },
  {
    icon: CreditCard,
    title: 'Clinic administrators and billing staff',
    body: 'Administrators, office managers and billing roles can manage plans, access and invoices.',
  },
] as const

export default function Who() {
  return (
    <section className="sec" id="who">
      <div className="wrap">
        <div className="sec-head rv">
          <h2>Built for the people who run the clinic.</h2>
          <p>
            Team roles and permissions mean everyone sees the tools that match their work.
          </p>
        </div>
        <div className="w-grid">
          {cards.map(({ icon: Icon, title, body }) => (
            <div className="card hov w-card rv" key={title}>
              <span className="ico">
                <Icon className="i" aria-hidden />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
