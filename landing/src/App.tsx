import Nav from "./components/Nav"
import Hero from "./components/Hero"
import Highlights from "./components/Highlights"
import Platform from "./components/Platform"
import HowItWorks from "./components/HowItWorks"
import Pricing from "./components/Pricing"
import FAQ from "./components/FAQ"
import FinalCTA from "./components/FinalCTA"
import Footer from "./components/Footer"
import { useReveal } from "./hooks/useReveal"
import { useHashScroll } from "./hooks/useHashScroll"
import "./styles.css"

export default function App() {
  useReveal()
  useHashScroll()

  return (
    <div className="landing-root" data-landing-root>
      <Nav />
      <main>
        <Hero />
        <Highlights />
        <Platform />
        <HowItWorks />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
