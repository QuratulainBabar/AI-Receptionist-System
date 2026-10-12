const benefits = [
  {
    title: 'Never leave callers waiting on a busy day',
    body: 'The phone agent picks up while your team is with patients, books open times, and sends the confirmation code, so callers get an answer straight away.',
  },
  {
    title: 'Protect the calendar with verified booking',
    body: 'Only real open slots are offered and nothing is confirmed until the caller enters their SMS code. Reminders go out at 3 days, 24 hours and 6 hours.',
  },
  {
    title: 'Run the practice from one calm portal',
    body: 'Appointments, follow-ups, patient files, records requests, invoice links and team access live in one place, with activity history to keep everyone aligned.',
  },
] as const

export default function Benefits() {
  return (
    <section className="sec benefits" id="benefits">
      <div className="wrap">
        <div className="sec-head rv">
          <h2>Why clinics choose AI Receptionist</h2>
        </div>
        <div className="b-grid">
          {benefits.map((b) => (
            <div className="b-col rv" key={b.title}>
              <h3>{b.title}</h3>
              <p>{b.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
