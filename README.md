# Component Gallery

My entry for the LofiStack 90-day challenge (Oct 1 – Dec 29, 2026): new UI components every week, each on its own page with a live demo and full source.

Built with Next.js (App Router) and TypeScript, exported as static HTML and hosted on GitHub Pages:
https://rownok-hr-ls.github.io/component-gallery/

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000/component-gallery.

## Deploy

```bash
npm run deploy
```

Builds the site into `.next-deploy/` (separate from the dev server's `.next/`) and force-pushes it to the `gh-pages` branch, which GitHub Pages serves.

## Adding a component

1. Create a folder `src/gallery/<slug>/`, for example `src/gallery/glass-button/`.
2. Put the component, its styles (`*.module.css`), and a `Demo.tsx` in that folder. Every file in the folder is shown as source on the component's page.
3. Import the `Demo` in `src/gallery/registry.ts` and add an entry to `gallery`.
4. Push to `main`, then run `npm run deploy`. The component is live at `/component-gallery/components/<slug>/`.

## Log

| Week | Dates | Components |
|------|-------|------------|
| 1 | Oct 1 – Oct 7 | [Loan / EMI Calculator](https://rownok-hr-ls.github.io/component-gallery/components/loan-emi-calculator/), [Unit Converter Dial](https://rownok-hr-ls.github.io/component-gallery/components/unit-converter-dial/) |
| 2 | Oct 8 – Oct 14 | [Password Strength Meter](https://rownok-hr-ls.github.io/component-gallery/components/password-strength-meter/), [Customer Lifetime Value Calculator](https://rownok-hr-ls.github.io/component-gallery/components/customer-lifetime-value/) |
| 3 | Oct 15 – Oct 21 | [Photo Resizer for Official Forms](https://rownok-hr-ls.github.io/component-gallery/components/photo-resizer/), [Morphing Submit Button](https://rownok-hr-ls.github.io/component-gallery/components/morphing-submit-button/) |
| 4 | Oct 22 – Oct 28 | [Spin-the-Wheel Picker](https://rownok-hr-ls.github.io/component-gallery/components/spin-the-wheel/), [Stacking Toast Notifications](https://rownok-hr-ls.github.io/component-gallery/components/stacking-toasts/) |
| 5 | Oct 29 – Nov 4 | [Document Scanner](https://rownok-hr-ls.github.io/component-gallery/components/document-scanner/), [Text Diff Checker](https://rownok-hr-ls.github.io/component-gallery/components/text-diff/) |
| 6 | Nov 5 – Nov 11 | [Collaborative Whiteboard](https://rownok-hr-ls.github.io/component-gallery/components/collaborative-whiteboard/), [Live Meeting Captions & Action Items](https://rownok-hr-ls.github.io/component-gallery/components/meeting-captions/) |
| 7 | Nov 12 – Nov 18 | |
| 8 | Nov 19 – Nov 25 | |
| 9 | Nov 26 – Dec 2 | |
| 10 | Dec 3 – Dec 9 | |
| 11 | Dec 10 – Dec 16 | |
| 12 | Dec 17 – Dec 23 | |
| 13 | Dec 24 – Dec 29 | |
