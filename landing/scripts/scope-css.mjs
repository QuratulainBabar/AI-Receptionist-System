import fs from "node:fs"

let css = fs.readFileSync("E:/ai_receptionist_lp/styles.css", "utf8")
css = css.replace(/url\('images\/hero_doctor\.png'\)/g, "url('/images/hero_doctor.png')")
css = css.replace(/url\('images\/CTA bg\.png'\)/g, "url('/images/cta-bg.png')")
css = css.replace(/:root\s*\{/g, ".landing-root {")
css = css.replace(/^html\s*\{[\s\S]*?\}\n/m, "")
css = css.replace(/^body\s*\{/m, ".landing-root {")

// Collapse multi-line selectors onto one line so prefixing is reliable
css = css.replace(/([^{}@/\n][^{}@]*?),\s*\n\s*/g, "$1, ")

const lines = css.split("\n")
const out = []
let depth = 0
let inKeyframes = false

function prefixSelectors(selectorList) {
  return selectorList
    .split(",")
    .map((s) => {
      s = s.trim()
      if (!s) return s
      if (s.startsWith(".landing-root")) return s
      if (s === "from" || s === "to" || /^\d+%$/.test(s)) return s
      return `.landing-root ${s}`
    })
    .join(", ")
}

for (const line of lines) {
  const trimmed = line.trim()
  const opens = (line.match(/\{/g) || []).length
  const closes = (line.match(/\}/g) || []).length

  if (trimmed.startsWith("@keyframes")) inKeyframes = true

  const atRule = trimmed.startsWith("@")
  const canPrefix =
    !inKeyframes &&
    !atRule &&
    opens > 0 &&
    (depth === 0 || depth === 1) &&
    /^([.#*[a-zA-Z]|:root)/.test(trimmed) &&
    !trimmed.startsWith(".landing-root")

  if (canPrefix) {
    const idx = line.indexOf(trimmed)
    const indent = line.slice(0, Math.max(0, idx))
    const openIdx = trimmed.indexOf("{")
    const selectors = trimmed.slice(0, openIdx).trim()
    const rest = trimmed.slice(openIdx)
    out.push(`${indent}${prefixSelectors(selectors)} ${rest}`)
  } else {
    out.push(line)
  }

  depth += opens - closes
  if (inKeyframes && depth === 0 && closes > 0) inKeyframes = false
}

const result =
  "/* AI Receptionist landing — ported from ai_receptionist_lp mockup, scoped under .landing-root */\n" +
  out.join("\n")

fs.writeFileSync("E:/AI-Receptionist-System/landing/src/styles.css", result)
console.log("Wrote scoped CSS", result.length, "chars")
