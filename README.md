# Component Gallery

My entry for the LofiStack 90-day challenge (Oct 1 – Dec 29, 2026): new UI components every week, each on its own page with a live demo and full source.

Built with Next.js (App Router) and TypeScript, deployed on Vercel.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Adding a component

1. Create a folder `src/gallery/<slug>/`, for example `src/gallery/glass-button/`.
2. Put the component, its styles (`*.module.css`), and a `Demo.tsx` in that folder. Every file in the folder is shown as source on the component's page.
3. Import the `Demo` in `src/gallery/registry.ts` and add an entry to `gallery`.
4. Push to `main`. Vercel redeploys, and the component is live at `/components/<slug>`.

## Log

| Week | Dates | Components |
|------|-------|------------|
| 1 | Oct 1 – Oct 7 | |
| 2 | Oct 8 – Oct 14 | |
| 3 | Oct 15 – Oct 21 | |
| 4 | Oct 22 – Oct 28 | |
| 5 | Oct 29 – Nov 4 | |
| 6 | Nov 5 – Nov 11 | |
| 7 | Nov 12 – Nov 18 | |
| 8 | Nov 19 – Nov 25 | |
| 9 | Nov 26 – Dec 2 | |
| 10 | Dec 3 – Dec 9 | |
| 11 | Dec 10 – Dec 16 | |
| 12 | Dec 17 – Dec 23 | |
| 13 | Dec 24 – Dec 29 | |
