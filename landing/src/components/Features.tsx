import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Bell,
  CalendarCheck,
  CreditCard,
  FileText,
  Globe,
  KeyRound,
  LayoutGrid,
  Phone,
  Repeat,
  ShieldCheck,
  Users,
} from 'lucide-react'

const features: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Phone,
    title: 'AI phone receptionist',
    body: 'Answers your clinic line with the doctor and clinic profile in context.',
  },
  {
    icon: CalendarCheck,
    title: 'Real-time availability booking',
    body: 'Offers only open slots from your weekly schedule, dates and breaks.',
  },
  {
    icon: ShieldCheck,
    title: 'SMS OTP appointment confirmation',
    body: 'A 6-digit code verifies the caller before the visit is confirmed.',
  },
  {
    icon: LayoutGrid,
    title: 'Appointment lifecycle management',
    body: 'Track New, Pending, Confirmed, Completed, Cancelled and Follow-Up visits.',
  },
  {
    icon: Users,
    title: 'Patient list and patient files',
    body: 'Search or add patients and open a full file with history and timeline.',
  },
  {
    icon: FileText,
    title: 'Medical records and report requests',
    body: 'Store reports and request records from patients with an SMS upload link.',
  },
  {
    icon: Bell,
    title: 'Automated SMS reminders',
    body: 'Patients are reminded 3 days, 24 hours and 6 hours before the visit.',
  },
  {
    icon: Repeat,
    title: 'Follow-up scheduling',
    body: 'Book the next visit from the patient file so continuing care isn’t lost.',
  },
  {
    icon: KeyRound,
    title: 'Clinic team permissions',
    body: 'Invite staff with role-based access, from receptionist to billing.',
  },
  {
    icon: CreditCard,
    title: 'Stripe plans and appointment invoices',
    body: 'Subscribe through Stripe and send visit invoice payment links by SMS.',
  },
  {
    icon: Globe,
    title: 'Multilingual phone agent options',
    body: 'Configure the agent in English, Urdu, Hindi, Arabic, Spanish, French or German.',
  },
  {
    icon: Activity,
    title: 'Activity history and notifications',
    body: 'See what happened and when, with notifications for your team.',
  },
]

export default function Features() {
  return (
    <section className="sec features" id="features">
      <div className="wrap">
        <div className="sec-head rv">
          <h2>Everything your front desk and clinic team need.</h2>
          <p>Real capabilities, working together from the first call to the follow-up visit.</p>
        </div>
        <div className="f-grid">
          {features.map(({ icon: Icon, title, body }) => (
            <div className="card hov f-card rv" key={title}>
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
