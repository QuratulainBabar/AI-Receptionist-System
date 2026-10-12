import {
  Activity,
  Bell,
  CalendarCheck,
  Check,
  Clock,
  FileText,
  LayoutGrid,
  Phone,
  Users,
} from 'lucide-react'
import { SIGN_UP_URL } from '../lib/app'

export default function Hero() {
  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <span className="tag">
            <span className="live" />
            AI Receptionist for modern clinics
          </span>
          <h1>Your clinic&apos;s AI receptionist — answers, books, and organizes.</h1>
          <p className="sub">
            An AI phone agent that books from your real schedule with SMS OTP confirmation plus a
            doctor portal for appointments, patients, records, reminders,
            <br />
            and billing.
          </p>
          <div className="cta-row">
            <a href={SIGN_UP_URL} className="btn btn-white">
              Start with AI Receptionist
            </a>
          </div>
         
        </div>

        <div
          className="hero-visual"
          aria-label="Doctor portal preview with an AI call in progress"
        >
          <div className="float" data-depth="10">
            <div className="mock">
              <div className="m-top">
                <i />
                <i />
                <i />
                <span>Doctor portal · Dashboard</span>
              </div>
              <div className="m-body">
                <aside className="m-side">
                  <div className="m-logo">
                    <b>
                      <Activity />
                    </b>
                    AI Receptionist
                  </div>
                  <div className="m-nav on">
                    <LayoutGrid />
                    Dashboard
                  </div>
                  <div className="m-nav">
                    <CalendarCheck />
                    Appointments
                  </div>
                  <div className="m-nav">
                    <Users />
                    Patient List
                  </div>
                  <div className="m-nav">
                    <FileText />
                    Reports
                  </div>
                  <div className="m-nav">
                    <Phone />
                    My Clinic
                  </div>
                  <div className="m-nav">
                    <Clock />
                    Availability
                  </div>
                  <div className="m-nav">
                    <Bell />
                    Notifications
                  </div>
                </aside>
                <div className="m-main">
                  <div className="m-h">
                    <div>
                      <h4>Good morning, Dr. Khan</h4>
                      <span className="m-muted">Today&apos;s visits</span>
                    </div>
                    <span className="m-btn">+ Add patient</span>
                  </div>
                  <div className="m-stats">
                    <div className="m-stat">
                      <span className="m-muted">Today</span>
                      <b>8</b>
                    </div>
                    <div className="m-stat">
                      <span className="m-muted">Awaiting confirmation</span>
                      <b>2</b>
                    </div>
                    <div className="m-stat">
                      <span className="m-muted">Follow-ups</span>
                      <b>3</b>
                    </div>
                  </div>
                  <div className="m-list">
                    <div className="m-row">
                      <span className="m-time">9:00</span>
                      <div className="m-who">
                        <span className="m-av">SA</span>
                        <div>
                          <strong>Sara Ahmed</strong>
                          <span>Follow-up · In clinic</span>
                        </div>
                      </div>
                      <span className="chip done">Completed</span>
                    </div>
                    <div className="m-row">
                      <span className="m-time">9:30</span>
                      <div className="m-who">
                        <span className="m-av">RM</span>
                        <div>
                          <strong>Rahul Mehta</strong>
                          <span>Fever and cough · In clinic</span>
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
                          <span>Consultation · Video call</span>
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
                          <span>New patient · In clinic</span>
                        </div>
                      </div>
                      <span className="chip pending">Pending</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="confirm mock float" data-depth="-14">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="tick">
                <Check />
              </span>
              <div>
                <strong style={{ fontSize: 13 }}>Appointment confirmed</strong>
                <div className="m-muted" style={{ fontSize: 12 }}>
                  Daniel Kim · Today 11:00
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: 10,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span className="chip done">OTP verified</span>
              <span className="m-muted" style={{ fontSize: 12 }}>
                In clinic
              </span>
            </div>
          </div>

          <div className="call float" data-depth="-22">
            <div className="row">
              <span className="live" />
              <strong style={{ fontSize: 13.5 }}>AI Receptionist answering…</strong>
              <span className="wave" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="steps">
              <div>
                <Check />
                Greeted caller with clinic context
              </div>
              <div>
                <Check />
                Checking availability… 11:00 open
              </div>
              <div>
                <Check />
                Slot held · OTP sent by SMS
              </div>
            </div>
            <div className="otp">
              <span style={{ opacity: 0.8 }}>6-digit code</span>
              <b>• • • • • •</b>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
