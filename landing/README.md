# AI Receptionist — landing page (React + TypeScript)

Vite + React + TypeScript port of the AI Receptionist clinic landing page. Design and responsive layout match the original static site. Icons use [lucide-react](https://lucide.dev).

## Scripts

```bash
npm install
npm run dev      # local dev server
npm run build    # production build
npm run preview  # preview production build
```

## Structure

- `src/App.tsx` — page composition
- `src/components/` — section components (Nav, Hero, Pricing, FAQ, …)
- `src/hooks/` — scroll reveal and hero parallax
- `src/styles.css` — original design tokens and responsive rules
- `public/favicon.svg` — site icon

## Notes

- Plus Jakarta Sans loads from Google Fonts (needs internet). Fallback stack is in CSS `--font`.
- Pricing amounts live in `src/components/Pricing.tsx`.
