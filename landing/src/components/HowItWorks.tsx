import { Check } from 'lucide-react'

const steps = [
  {
    n: '1',
    title: 'Patient calls the clinic',
    body: 'The AI receptionist answers with your clinic and doctor context.',
  },
  {
    n: '2',
    title: 'Checks your real schedule',
    body: 'It only offers open slots from your availability.',
  },
  {
    n: '3',
    title: 'Verifies with SMS OTP',
    body: 'A 6-digit code is sent to the caller. The visit is confirmed only after verification.',
  },
  {
    n: '4',
    title: 'Lands in your doctor portal',
    body: 'The appointment appears for your team with patient context, reminders, records and follow-up tools.',
  },
] as const

export default function HowItWorks() {
  return (
    <section className="sec" id="how">
      <div className="wrap">
        <div className="sec-head rv">
          <h2>From first ring to confirmed visit.</h2>
          <p>Four steps, with the patient verified before anything is confirmed.</p>
        </div>
        <div className="steps-h">
          {steps.map((s) => (
            <div className="step rv" key={s.n}>
              <div className="n">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
        <div className="callline rv">
          <div>
            <h3>What happens on a real patient call</h3>
            <p>A short, natural conversation that ends with a verified booking in your portal.</p>
          </div>
          <div className="dialog">
            <div className="bubble ai">
              <small>AI Receptionist</small>
              Thank you for calling. How can I help?
            </div>
            <div className="bubble pt">
              <small>Caller</small>
              I’d like to see the doctor tomorrow morning.
            </div>
            <div className="bubble ai">
              <small>AI Receptionist</small>
              I have 9:30 or 11:00 open. Which works better?
            </div>
            <div className="sysmsg">
              <Check className="i" aria-hidden />
              Slot held · 6-digit code sent by SMS
            </div>
            <div className="bubble pt">
              <small>Caller</small>
              11:00, and here is the code.
            </div>
            <div className="sysmsg">
              <Check className="i" aria-hidden />
              Verified · Appointment confirmed in the portal
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
