const STEPS = [
  "Patient calls the clinic.",
  "AI receptionist answers and handles the appointment request.",
  "Available appointment slots are checked.",
  "Patient verifies the booking through email OTP.",
  "Appointment is managed through the doctor portal.",
] as const

export default function HowItWorks() {
  return (
    <section className="workflow-section" id="workflow">
      <div className="container">
        <div className="workflow-header" id="workflow-header">
          <h2 className="workflow-title">From first ring to confirmed visit</h2>
          <p className="workflow-subtitle">AI Receptionist Workflow Overview</p>
        </div>
        <div className="workflow-track" id="workflow-track">
          <div className="workflow-line" aria-hidden="true" />
          {STEPS.map((text, index) => (
            <div className="workflow-card" key={text}>
              <span className="workflow-num">{index + 1}</span>
              <p className="workflow-text">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
