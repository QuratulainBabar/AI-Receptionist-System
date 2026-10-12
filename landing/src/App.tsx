import Nav from "./components/Nav"
import Hero from "./components/Hero"
import Strip from "./components/Strip"
import Problem from "./components/Problem"
import Solution from "./components/Solution"
import Showcase from "./components/Showcase"
import Features from "./components/Features"
import HowItWorks from "./components/HowItWorks"
import Benefits from "./components/Benefits"
import Stories from "./components/Stories"
import Pricing from "./components/Pricing"
import Who from "./components/Who"
import FAQ from "./components/FAQ"
import FinalCTA from "./components/FinalCTA"
import Footer from "./components/Footer"
import { useReveal } from "./hooks/useReveal"
import { useHeroFloat } from "./hooks/useHeroFloat"
import { useHashScroll } from "./hooks/useHashScroll"
import "./styles.css"

export default function App() {
  useReveal()
  useHeroFloat()
  useHashScroll()

  return (
    <div className="landing-root" data-landing-root>
      <Nav />
      <main id="top">
        <Hero />
        <Strip />
        <Problem />
        <Solution />
        <Showcase />
        <Features />
        <HowItWorks />
        <Benefits />
        <Stories />
        <Pricing />
        <Who />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
