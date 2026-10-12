import { Activity } from 'lucide-react'

export default function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="foot">
          <div>
            <a href="#top" className="brand">
              <span className="mark">
                <Activity aria-hidden />
              </span>
              AI Receptionist
            </a>
            <p>
              Your clinic’s AI phone receptionist, with a practice portal built for doctors and
              clinic teams.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li>
                <a href="#features">Features</a>
              </li>
              <li>
                <a href="#how">How it works</a>
              </li>
              <li>
                <a href="#pricing">Pricing</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Clinic</h4>
            <ul>
              <li>
                <a href="#showcase">Appointments</a>
              </li>
              <li>
                <a href="#showcase">Patients</a>
              </li>
              <li>
                <a href="#stories">Phone AI</a>
              </li>
              <li>
                <a href="#pricing">Plans</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li>
                <a href="#">About</a>
              </li>
              <li>
                <a href="#">Contact</a>
              </li>
              <li>
                <a href="#">Privacy</a>
              </li>
              <li>
                <a href="#">Terms</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="bottom">
          <span>© AI Receptionist</span>
          <span>Smart Healthcare Starts Here</span>
        </div>
      </div>
    </footer>
  )
}
