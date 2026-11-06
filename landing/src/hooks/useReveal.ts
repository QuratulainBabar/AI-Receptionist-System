import { useEffect } from "react"

/** Adds `.animated` to `.animate-on-scroll` elements when they enter the viewport. */
export function useReveal() {
  useEffect(() => {
    const root = document.querySelector(".landing-root")
    if (!root) return

    const mark = () => {
      root.querySelectorAll<HTMLElement>(
        ".glass-card, .highlight-item, .hero-laptop-img, #features-grid-header, #pricing-header, #faq-header, #cta-card, .pricing-card, .faq-item, .workflow-header, .workflow-card",
      ).forEach((el, index) => {
        el.classList.add("animate-on-scroll")
        if (!el.className.includes("animate-delay-")) {
          el.classList.add(`animate-delay-${Math.min((index % 8) + 1, 8)}`)
        }
      })
    }

    mark()

    const elements = Array.from(root.querySelectorAll<HTMLElement>(".animate-on-scroll"))
    if (!("IntersectionObserver" in window)) {
      elements.forEach((el) => el.classList.add("animated"))
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animated")
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    )

    requestAnimationFrame(() => {
      elements.forEach((el) => io.observe(el))
    })

    return () => io.disconnect()
  }, [])
}
