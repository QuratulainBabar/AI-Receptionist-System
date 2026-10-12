import { useState } from 'react'
import { Check } from 'lucide-react'
import { planSignupUrl, type LandingPlanSlug } from '../lib/app'

type Period = 'monthly' | 'yearly'

type Plan = {
  slug: LandingPlanSlug
  name: string
  forText: string
  badge?: string
  featured?: boolean
  pilot?: boolean
  cta: string
  ctaClass: string
  monthly: { amt: string; per: string; sub: string }
  yearly: { amt: string; per: string; sub: string }
  features: { text: string; heading?: boolean }[]
}

const plans: Plan[] = [
  {
    slug: 'starter',
    name: 'Starter',
    forText: 'Best for solo clinics getting started.',
    cta: 'Choose Starter',
    ctaClass: 'btn btn-line',
    monthly: { amt: '$299', per: '/month', sub: 'Billed monthly' },
    yearly: { amt: '$2,990', per: '/year', sub: 'Billed yearly · about $249/month' },
    features: [
      { text: 'AI phone receptionist' },
      { text: 'Appointment booking from real availability' },
      { text: 'SMS OTP confirmation' },
      { text: 'Doctor dashboard' },
      { text: 'Appointments management' },
      { text: 'Patient list' },
      { text: 'Basic medical records and reports' },
      { text: 'Automated appointment reminders' },
      { text: 'SMS notifications' },
      { text: 'Availability calendar' },
      { text: 'Stripe plan billing' },
    ],
  },
  {
    slug: 'growth',
    name: 'Growth',
    forText: 'Best for established clinics.',
    badge: 'Most popular',
    featured: true,
    cta: 'Choose Growth',
    ctaClass: 'btn',
    monthly: { amt: '$599', per: '/month', sub: 'Billed monthly' },
    yearly: { amt: '$5,990', per: '/year', sub: 'Billed yearly · about $499/month' },
    features: [
      { text: 'Everything in Starter, plus', heading: true },
      { text: 'Follow-up scheduling' },
      { text: 'Patient timeline with clinical notes and prescriptions' },
      { text: 'Medical record upload requests via SMS' },
      { text: 'Appointment invoice links (Stripe)' },
      { text: 'Clinic team users with permissions' },
      { text: 'Activity history and richer notifications' },
      {
        text: 'My Clinic phone AI configuration (greeting, language, voice, sync)',
      },
      { text: 'Advanced practice dashboard workflows' },
    ],
  },
  {
    slug: 'pilot',
    name: 'Pilot',
    forText: 'Growth for 1 year at a locked rate.',
    badge: 'Locked rate',
    pilot: true,
    cta: 'Start Pilot',
    ctaClass: 'btn btn-primary',
    monthly: {
      amt: '$400',
      per: '/month',
      sub: '$400/month rate locked for one year · billed $4,800 yearly',
    },
    yearly: {
      amt: '$4,800',
      per: '/year',
      sub: 'Billed $4,800 yearly · $400/month rate locked for one year',
    },
    features: [
      { text: 'Same Growth experience · rate locked for 12 months', heading: true },
      { text: 'All Growth capabilities' },
      { text: 'Locked $400/month rate for 1 year' },
      { text: 'Billed $4,800 yearly' },
      {
        text: 'Ideal for clinics piloting AI Receptionist with full Growth workflows',
      },
    ],
  },
]

export default function Pricing() {
  const [period, setPeriod] = useState<Period>('monthly')
  const yearly = period === 'yearly'

  return (
    <section className="sec pricing" id="pricing">
      <div className="wrap">
        <div className="sec-head center rv">
          <h2>Simple plans for growing clinics</h2>
          <p>Monthly or yearly billing. Upgrade when your clinic is ready.</p>
          <div className="switch" role="group" aria-label="Billing period">
            <button
              type="button"
              aria-pressed={!yearly}
              onClick={() => setPeriod('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-pressed={yearly}
              onClick={() => setPeriod('yearly')}
            >
              Yearly
            </button>
          </div>
        </div>

        <div className="price-grid">
          {plans.map((plan) => {
            const price = yearly ? plan.yearly : plan.monthly
            const className = [
              'card',
              'plan',
              'rv',
              plan.featured ? 'featured' : '',
              plan.pilot ? 'pilot' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <article className={className} key={plan.name}>
                {plan.badge ? <span className="badge">{plan.badge}</span> : null}
                <h3>{plan.name}</h3>
                <p className="for">{plan.forText}</p>
                <div className="priceline">
                  <span className="amt">{price.amt}</span>
                  <span className="per">{price.per}</span>
                </div>
                <p className="sub2">
                  <span>{price.sub}</span>
                </p>
                <hr />
                <ul>
                  {plan.features.map((f) => (
                    <li key={f.text} className={f.heading ? 'hd' : undefined}>
                      {!f.heading ? <Check className="i" aria-hidden /> : null}
                      {f.text}
                    </li>
                  ))}
                </ul>
                <a href={planSignupUrl(plan.slug, period)} className={plan.ctaClass}>
                  {plan.cta}
                </a>
              </article>
            )
          })}
        </div>
        <p className="foot-note">
          Prices shown in USD. Billing is handled securely via Stripe.{' '}
          <a href="#" style={{ textDecoration: 'underline', color: 'var(--link)' }}>
            Talk to sales
          </a>{' '}
          if you have questions about the right plan.
        </p>
      </div>
    </section>
  )
}
