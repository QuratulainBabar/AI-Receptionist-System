const CARDS = [
  {
    num: "01",
    title: "AI phone receptionist",
    desc: "A natural voice agent that answers calls and helps patients book.",
  },
  {
    num: "02",
    title: "Availability-aware scheduling",
    desc: "Open slots come directly from the calendar your clinic actually uses.",
  },
  {
    num: "03",
    title: "SMS OTP confirmation",
    desc: "Patients verify by text before a voice booking is confirmed.",
  },
  {
    num: "04",
    title: "Automated reminders",
    desc: "Scheduled SMS reminders keep every appointment on track.",
  },
  {
    num: "05",
    title: "Doctor dashboard",
    desc: "Today's visits, pending confirmations, and alerts in one view.",
  },
  {
    num: "06",
    title: "Appointment management",
    desc: "Track status, follow-ups, and the details that keep care moving.",
  },
] as const

export default function Platform() {
  return (
    <section className="features-grid-section" id="platform">
      <div className="container">
        <div className="platform-panel" id="platform-panel">
          <div className="platform-intro" id="features-grid-header">
            <h2 className="platform-title">Everything your front desk needs.</h2>
            <p className="platform-description">
              Reliable phone booking and everyday practice operations, designed to live together not
              compete for your attention.
            </p>
          </div>
          <div className="glass-grid" id="platform-list">
            {CARDS.map((card) => (
              <div className="glass-card" key={card.num}>
                <span className="glass-num">{card.num}</span>
                <div className="glass-body">
                  <h3 className="glass-title">{card.title}</h3>
                  <p className="glass-desc">{card.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
