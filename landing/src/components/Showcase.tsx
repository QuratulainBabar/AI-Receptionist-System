import { useCallback, useState, type KeyboardEvent } from 'react'

const TABS = [
  { id: 't1', panel: 'p1', label: 'Dashboard' },
  { id: 't2', panel: 'p2', label: 'Appointments' },
  { id: 't3', panel: 'p3', label: 'Patient file' },
  { id: 't4', panel: 'p4', label: 'My Clinic' },
] as const

const CAPTIONS: Record<(typeof TABS)[number]['id'], { title: string; body: string }> = {
  t1: {
    title: 'Dashboard.',
    body: 'A calm start to the day: today’s visits, appointments awaiting confirmation, alerts and the latest notifications.',
  },
  t2: {
    title: 'Appointments.',
    body: 'Filter by Pending, Confirmed, Completed, Cancelled and Follow-ups, with patient, time, reason and actions on every row.',
  },
  t3: {
    title: 'Patient file.',
    body: 'History, records and a clinical timeline in one place, with notes, prescriptions and a one-tap records request by SMS.',
  },
  t4: {
    title: 'My Clinic.',
    body: 'Set your agent’s greeting, language and voice, and see the status of your clinic’s phone AI.',
  },
}

type TabId = (typeof TABS)[number]['id']

export default function Showcase() {
  const [active, setActive] = useState<TabId>('t1')
  const caption = CAPTIONS[active]

  const select = useCallback((id: TabId) => setActive(id), [])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length
    if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    if (next !== null) {
      e.preventDefault()
      select(TABS[next].id)
      document.getElementById(TABS[next].id)?.focus()
    }
  }

  return (
    <section className="sec" id="showcase">
      <div className="wrap">
        <div className="sec-head center rv">
          <h2>Designed for the way clinics actually work.</h2>
          <p>Four views your team will use every day.</p>
        </div>

        <div className="show-tabs rv" role="tablist" aria-label="Product previews">
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              className="tab"
              role="tab"
              id={tab.id}
              type="button"
              aria-selected={active === tab.id}
              aria-controls={tab.panel}
              tabIndex={active === tab.id ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="stage rv">
          <div
            className={`pane${active === 't1' ? ' on' : ''}`}
            id="p1"
            role="tabpanel"
            aria-labelledby="t1"
          >
            <div className="mock">
              <div className="m-top">
                <i />
                <i />
                <i />
                <span>Doctor portal · Dashboard</span>
              </div>
              <div className="m-main" style={{ padding: '26px 28px' }}>
                <div className="m-h">
                  <div>
                    <h4 style={{ fontSize: 20 }}>Good morning, Dr. Khan</h4>
                    <span className="m-muted">
                      You have 8 visits today and 2 awaiting confirmation.
                    </span>
                  </div>
                  <span className="m-btn alt">View calendar</span>
                </div>
                <div className="m-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  <div className="m-stat">
                    <span className="m-muted">Today&apos;s visits</span>
                    <b>8</b>
                  </div>
                  <div className="m-stat">
                    <span className="m-muted">Awaiting confirmation</span>
                    <b>2</b>
                  </div>
                  <div className="m-stat">
                    <span className="m-muted">Completed</span>
                    <b>3</b>
                  </div>
                  <div className="m-stat">
                    <span className="m-muted">Follow-ups due</span>
                    <b>3</b>
                  </div>
                </div>
                <div className="two">
                  <div className="m-list">
                    <div
                      style={{
                        padding: '12px 14px',
                        fontWeight: 700,
                        borderBottom: '1px solid #EEF2F6',
                      }}
                    >
                      Today&apos;s schedule
                    </div>
                    <div className="m-row">
                      <span className="m-time">9:30</span>
                      <div className="m-who">
                        <span className="m-av">RM</span>
                        <div>
                          <strong>Rahul Mehta</strong>
                          <span>Fever and cough</span>
                        </div>
                      </div>
                      <span className="chip conf">Confirmed</span>
                    </div>
                    <div className="m-row">
                      <span className="m-time">10:15</span>
                      <div className="m-who">
                        <span className="m-av">LN</span>
                        <div>
                          <strong>Layla Nasser</strong>
                          <span>Video call</span>
                        </div>
                      </div>
                      <span className="chip conf">Confirmed</span>
                    </div>
                    <div className="m-row">
                      <span className="m-time">11:00</span>
                      <div className="m-who">
                        <span className="m-av">DK</span>
                        <div>
                          <strong>Daniel Kim</strong>
                          <span>New patient</span>
                        </div>
                      </div>
                      <span className="chip pending">Pending</span>
                    </div>
                  </div>
                  <div className="m-list">
                    <div
                      style={{
                        padding: '12px 14px',
                        fontWeight: 700,
                        borderBottom: '1px solid #EEF2F6',
                      }}
                    >
                      Latest notifications
                    </div>
                    <div className="m-row" style={{ gridTemplateColumns: '1fr auto' }}>
                      <div>
                        <strong>New booking from phone AI</strong>
                        <div className="m-muted">Daniel Kim · 11:00 · 2 min ago</div>
                      </div>
                      <span className="chip new">New</span>
                    </div>
                    <div className="m-row" style={{ gridTemplateColumns: '1fr auto' }}>
                      <div>
                        <strong>Records uploaded</strong>
                        <div className="m-muted">Layla Nasser · Lab report · 1 hr ago</div>
                      </div>
                    </div>
                    <div className="m-row" style={{ gridTemplateColumns: '1fr auto' }}>
                      <div>
                        <strong>Reminder sent</strong>
                        <div className="m-muted">Rahul Mehta · 24-hour reminder</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className={`pane${active === 't2' ? ' on' : ''}`}
            id="p2"
            role="tabpanel"
            aria-labelledby="t2"
          >
            <div className="mock">
              <div className="m-top">
                <i />
                <i />
                <i />
                <span>Doctor portal · Appointments</span>
              </div>
              <div className="m-main" style={{ padding: '26px 28px' }}>
                <div className="m-h">
                  <h4 style={{ fontSize: 20 }}>Appointments</h4>
                  <span className="m-btn">+ New appointment</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginBottom: 16,
                  }}
                >
                  <span className="chip new" style={{ padding: '6px 12px' }}>
                    New
                  </span>
                  <span className="chip pending" style={{ padding: '6px 12px' }}>
                    Pending 2
                  </span>
                  <span
                    className="chip conf"
                    style={{ padding: '6px 12px', outline: '2px solid #0D2C94' }}
                  >
                    Confirmed 5
                  </span>
                  <span className="chip done" style={{ padding: '6px 12px' }}>
                    Completed
                  </span>
                  <span className="chip canc" style={{ padding: '6px 12px' }}>
                    Cancelled
                  </span>
                  <span className="chip fu" style={{ padding: '6px 12px' }}>
                    Follow-ups 3
                  </span>
                </div>
                <div className="m-list">
                  <div
                    className="m-row"
                    style={{ gridTemplateColumns: '70px 1.2fr 1fr auto auto' }}
                  >
                    <span className="m-time">Mon 9:30</span>
                    <div className="m-who">
                      <span className="m-av">RM</span>
                      <strong>Rahul Mehta</strong>
                    </div>
                    <span className="m-muted">Fever and cough</span>
                    <span className="chip conf">In clinic</span>
                    <span className="m-btn alt">Open</span>
                  </div>
                  <div
                    className="m-row"
                    style={{ gridTemplateColumns: '70px 1.2fr 1fr auto auto' }}
                  >
                    <span className="m-time">Mon 10:15</span>
                    <div className="m-who">
                      <span className="m-av">LN</span>
                      <strong>Layla Nasser</strong>
                    </div>
                    <span className="m-muted">Consultation</span>
                    <span className="chip conf">Video call</span>
                    <span className="m-btn alt">Open</span>
                  </div>
                  <div
                    className="m-row"
                    style={{ gridTemplateColumns: '70px 1.2fr 1fr auto auto' }}
                  >
                    <span className="m-time">Mon 11:00</span>
                    <div className="m-who">
                      <span className="m-av">DK</span>
                      <strong>Daniel Kim</strong>
                    </div>
                    <span className="m-muted">New patient visit</span>
                    <span className="chip pending">Pending</span>
                    <span className="m-btn">Confirm</span>
                  </div>
                  <div
                    className="m-row"
                    style={{ gridTemplateColumns: '70px 1.2fr 1fr auto auto' }}
                  >
                    <span className="m-time">Mon 14:00</span>
                    <div className="m-who">
                      <span className="m-av">PS</span>
                      <strong>Priya Shah</strong>
                    </div>
                    <span className="m-muted">Blood pressure review</span>
                    <span className="chip fu">Follow-up</span>
                    <span className="m-btn alt">Open</span>
                  </div>
                  <div
                    className="m-row"
                    style={{ gridTemplateColumns: '70px 1.2fr 1fr auto auto' }}
                  >
                    <span className="m-time">Mon 15:30</span>
                    <div className="m-who">
                      <span className="m-av">OH</span>
                      <strong>Omar Haddad</strong>
                    </div>
                    <span className="m-muted">Annual check-up</span>
                    <span className="chip pending">Pending</span>
                    <span className="m-btn">Confirm</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className={`pane${active === 't3' ? ' on' : ''}`}
            id="p3"
            role="tabpanel"
            aria-labelledby="t3"
          >
            <div className="mock">
              <div className="m-top">
                <i />
                <i />
                <i />
                <span>Doctor portal · Patient file</span>
              </div>
              <div className="m-main" style={{ padding: '26px 28px' }}>
                <div className="m-h">
                  <div className="m-who">
                    <span className="m-av" style={{ width: 44, height: 44, fontSize: 14 }}>
                      RM
                    </span>
                    <div>
                      <h4 style={{ fontSize: 19 }}>Rahul Mehta</h4>
                      <span className="m-muted">Male · 42 · Last visit Mon 9:30</span>
                    </div>
                  </div>
                  <span className="m-btn">Request records by SMS</span>
                </div>
                <div className="two" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 12 }}>Timeline</div>
                    <div className="tl">
                      <div>
                        <strong>Clinical note</strong> <span className="m-muted">· Mon</span>
                        <div className="box">
                          Persistent dry cough for 5 days. Chest clear. Advised rest and fluids;
                          review if fever continues.
                        </div>
                      </div>
                      <div>
                        <strong>Prescription</strong> <span className="m-muted">· Mon</span>
                        <div className="box">Prescription added to the patient file.</div>
                      </div>
                      <div>
                        <strong>Follow-up scheduled</strong>{' '}
                        <span className="m-muted">· Next week</span>
                        <div className="box">Follow-up visit booked and reminders set.</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 12 }}>Medical history</div>
                    <div
                      className="box"
                      style={{
                        border: '1px solid #E2E8F0',
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 14,
                      }}
                    >
                      Seasonal allergies · No known drug allergies
                    </div>
                    <div style={{ fontWeight: 700, marginBottom: 12 }}>Reports and records</div>
                    <div className="m-list">
                      <div className="m-row" style={{ gridTemplateColumns: '1fr auto' }}>
                        <div>
                          <strong>Chest X-ray</strong>
                          <div className="m-muted">Uploaded</div>
                        </div>
                        <span className="chip done">Received</span>
                      </div>
                      <div className="m-row" style={{ gridTemplateColumns: '1fr auto' }}>
                        <div>
                          <strong>Blood test</strong>
                          <div className="m-muted">Upload link sent</div>
                        </div>
                        <span className="chip pending">Requested</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className={`pane${active === 't4' ? ' on' : ''}`}
            id="p4"
            role="tabpanel"
            aria-labelledby="t4"
          >
            <div className="mock">
              <div className="m-top">
                <i />
                <i />
                <i />
                <span>Doctor portal · My Clinic</span>
              </div>
              <div className="m-main" style={{ padding: '26px 28px' }}>
                <div className="m-h">
                  <div>
                    <h4 style={{ fontSize: 20 }}>My Clinic · Phone AI</h4>
                    <span className="m-muted">
                      Control how your AI receptionist greets and speaks to callers.
                    </span>
                  </div>
                  <span className="chip done" style={{ padding: '6px 12px' }}>
                    <span className="live" style={{ width: 7, height: 7 }} />
                    Phone AI active
                  </span>
                </div>
                <div className="two">
                  <div>
                    <div className="field">
                      <label>Clinic name</label>
                      <div className="input">Khan Family Clinic</div>
                    </div>
                    <div className="field">
                      <label>Agent greeting</label>
                      <div className="input textarea">
                        Thank you for calling Khan Family Clinic. I’m the clinic’s AI receptionist.
                        How can I help you today?
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="field">
                      <label>Language</label>
                      <div className="input">English</div>
                    </div>
                    <div className="field">
                      <label>Voice</label>
                      <div className="input">Calm · Female</div>
                    </div>
                    <div
                      className="field"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: '1px solid #E2E8F0',
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <div>
                        <strong>Sync with portal</strong>
                        <div className="m-muted">Availability and profile are up to date</div>
                      </div>
                      <span className="toggle" />
                    </div>
                    <span className="m-btn">Save changes</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="caption" id="caption">
          <strong>{caption.title}</strong> {caption.body}
        </p>
        <p className="note">Sample data shown for illustration.</p>
      </div>
    </section>
  )
}
