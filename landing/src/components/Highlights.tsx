const ITEMS = [
  {
    title: "Phone AI that books",
    text: "Handles inbound appointment requests and books against open slots, not a static script.",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
      </svg>
    ),
  },
  {
    title: "Confirmation you can trust",
    text: "SMS OTP verification before a booking is finalized.",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
      </svg>
    ),
  },
  {
    title: "One portal for the practice",
    text: "Doctors and clinic staff manage schedules, patients, records, invoices, and team access in one place.",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
      </svg>
    ),
  },
] as const

export default function Highlights() {
  return (
    <section className="product-highlights" id="product-highlights">
      <div className="container">
        <div className="highlight-grid">
          {ITEMS.map((item) => (
            <div className="highlight-item" key={item.title}>
              <div className="highlight-icon">{item.icon}</div>
              <h3 className="highlight-title">{item.title}</h3>
              <p className="highlight-text">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
