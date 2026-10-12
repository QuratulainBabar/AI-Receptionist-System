import { CalendarCheck, LayoutGrid, Phone, ShieldCheck } from 'lucide-react'

const items = [
  { icon: Phone, label: 'AI phone receptionist' },
  { icon: CalendarCheck, label: 'Real-schedule booking' },
  { icon: ShieldCheck, label: 'SMS OTP confirmation' },
  { icon: LayoutGrid, label: 'Clinic practice portal' },
] as const

export default function Strip() {
  return (
    <div className="strip">
      <div className="wrap">
        {items.map(({ icon: Icon, label }) => (
          <div className="strip-i" key={label}>
            <span className="ico">
              <Icon className="i" aria-hidden />
            </span>
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
