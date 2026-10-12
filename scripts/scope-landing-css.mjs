import fs from "node:fs";

const path = "landing/src/styles.css";
let css = fs.readFileSync(path, "utf8");

// Undo partial scoping so we can re-scope cleanly from a mostly-original file.
css = css.replace(/^\/\* Scoped under \.landing-root so the main app is unaffected \*\/\n/, "");
css = css.replaceAll(".landing-root[data-theme=\"dark\"]", ':root[data-theme="dark"]');
css = css.replaceAll('.landing-root:not([data-theme="light"])', ':root:not([data-theme="light"])');
css = css.replaceAll(".landing-root *,.landing-root *::before,.landing-root *::after", "*,*::before,*::after");
css = css.replaceAll(".landing-root svg.i", "svg.i");
css = css.replaceAll(
  ".landing-root .mark svg,.landing-root .m-logo b svg,.landing-root .m-nav svg,.landing-root .call .steps svg,.landing-root .confirm .tick svg,.landing-root .ticks svg,.landing-root .sysmsg svg,.landing-root .plan li svg,.landing-root .bridge svg",
  ".mark svg,.m-logo b svg,.m-nav svg,.call .steps svg,.confirm .tick svg,.ticks svg,.sysmsg svg,.plan li svg,.bridge svg",
);
css = css.replaceAll(".landing-root :focus-visible", ":focus-visible");
css = css.replaceAll(".landing-root h1,.landing-root h2,.landing-root h3,.landing-root h4", "h1,h2,h3,h4");
css = css.replaceAll(".landing-root p{", "p{");
css = css.replaceAll(".landing-root a{", "a{");
css = css.replaceAll(".landing-root button{", "button{");
css = css.replaceAll(".landing-root section{", "section{");
// Only replace bare `.landing-root{` that came from :root/html/body — leave for rewrite below
css = css.replaceAll(":root{", ".landing-root{");
css = css.replaceAll(':root[data-theme="dark"]', '.landing-root[data-theme="dark"]');
css = css.replaceAll(':root:not([data-theme="light"])', '.landing-root:not([data-theme="light"])');

/**
 * Prefix every selector in a selector list with `.landing-root`, unless already scoped.
 */
function scopeSelector(sel) {
  const s = sel.trim();
  if (!s) return s;
  if (s.startsWith("@")) return s;
  if (s.startsWith(".landing-root")) return s;
  if (s === ":root" || s.startsWith(":root")) {
    return s.replace(":root", ".landing-root");
  }
  if (s === "html" || s.startsWith("html ") || s.startsWith("html.") || s.startsWith("html:") || s.startsWith("html[")) {
    return s.replace(/^html/, ".landing-root");
  }
  if (s === "body" || s.startsWith("body ") || s.startsWith("body.") || s.startsWith("body:") || s.startsWith("body[")) {
    return s.replace(/^body/, ".landing-root");
  }
  if (s === "*" || s.startsWith("*") || s.includes("::")) {
    // *, *::before, etc.
    return s
      .split(",")
      .map((part) => {
        const p = part.trim();
        if (p.startsWith(".landing-root")) return p;
        return `.landing-root ${p}`;
      })
      .join(",");
  }
  // :focus-visible and similar
  if (s.startsWith(":")) {
    return `.landing-root ${s}`;
  }
  return `.landing-root ${s}`;
}

function scopeRuleBlock(block) {
  // Skip @keyframes contents — handled separately
  const m = block.match(/^([^{]+)\{([\s\S]*)\}$/);
  if (!m) return block;
  let selectors = m[1].trim();
  const body = m[2];

  if (selectors.startsWith("@")) {
    return block; // handled by outer pass
  }

  const scoped = selectors
    .split(",")
    .map((sel) => scopeSelector(sel))
    .join(",");
  return `${scoped}{${body}}`;
}

/**
 * Walk top-level CSS: rules and at-rules.
 */
function scopeCss(input) {
  let out = "";
  let i = 0;
  const n = input.length;

  while (i < n) {
    // comments
    if (input[i] === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2);
      out += input.slice(i, end === -1 ? n : end + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }

    // whitespace / stray chars
    if (/\s/.test(input[i])) {
      out += input[i];
      i++;
      continue;
    }

    // @-rules
    if (input[i] === "@") {
      const start = i;
      // find first { or ;
      while (i < n && input[i] !== "{" && input[i] !== ";") i++;
      if (i >= n) {
        out += input.slice(start);
        break;
      }
      if (input[i] === ";") {
        out += input.slice(start, i + 1);
        i++;
        continue;
      }
      // block @-rule
      const header = input.slice(start, i).trim();
      let depth = 0;
      const blockStart = i;
      for (; i < n; i++) {
        if (input[i] === "{") depth++;
        else if (input[i] === "}") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
      }
      const inner = input.slice(blockStart + 1, i - 1);
      if (header.startsWith("@keyframes") || header.startsWith("@font-face") || header.startsWith("@property")) {
        out += `${header}{${inner}}`;
      } else {
        // @media, @supports — scope nested rules
        out += `${header}{${scopeCss(inner)}}`;
      }
      continue;
    }

    // normal rule
    const start = i;
    while (i < n && input[i] !== "{") i++;
    if (i >= n) {
      out += input.slice(start);
      break;
    }
    let depth = 0;
    const blockStart = i;
    for (; i < n; i++) {
      if (input[i] === "{") depth++;
      else if (input[i] === "}") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    const rule = input.slice(start, i);
    out += scopeRuleBlock(rule);
  }

  return out;
}

// First restore html/body specials if they were already converted
css = css.replace(
  ".landing-root{scroll-behavior:smooth;scroll-padding-top:calc(84px + env(safe-area-inset-top,0px));min-height:100vh}",
  "html{scroll-behavior:smooth;scroll-padding-top:calc(84px + env(safe-area-inset-top,0px));height:100%}",
);
css = css.replace(
  ".landing-root{margin:0;font-family:var(--font);font-size:17px;line-height:1.6;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased;overflow-x:hidden}",
  "body{margin:0;font-family:var(--font);font-size:17px;line-height:1.6;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased;min-height:100%;overflow-x:hidden}",
);

// If :root was already turned into .landing-root for variables, keep as temp marker
// Re-read from LP if available; otherwise work with current file after undoing double-prefix risk.

let scoped = scopeCss(css);

// Deduplicate accidental double prefix
scoped = scoped.replaceAll(".landing-root .landing-root", ".landing-root");

if (!scoped.startsWith("/* Scoped")) {
  scoped = "/* Scoped under .landing-root so the main app is unaffected */\n" + scoped;
}

fs.writeFileSync(path, scoped);
console.log("OK fully scoped", path, scoped.length);
