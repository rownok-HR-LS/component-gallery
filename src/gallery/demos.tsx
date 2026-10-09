"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

// Lazy-loaded demos. This must be a client module: Next.js only code-splits dynamic imports made
// from client components, so each page downloads just the demos it shows (and three.js / Leaflet
// only where they're used).
const demos: Record<string, ComponentType> = {
  "loan-emi-calculator": dynamic(() => import("./loan-emi-calculator/Demo")),
  "unit-converter-dial": dynamic(() => import("./unit-converter-dial/Demo")),
  "password-strength-meter": dynamic(() => import("./password-strength-meter/Demo")),
  "customer-lifetime-value": dynamic(() => import("./customer-lifetime-value/Demo")),
  "photo-resizer": dynamic(() => import("./photo-resizer/Demo")),
  "morphing-submit-button": dynamic(() => import("./morphing-submit-button/Demo")),
  "spin-the-wheel": dynamic(() => import("./spin-the-wheel/Demo")),
  "stacking-toasts": dynamic(() => import("./stacking-toasts/Demo")),
  "document-scanner": dynamic(() => import("./document-scanner/Demo")),
  "text-diff": dynamic(() => import("./text-diff/Demo")),
  "collaborative-whiteboard": dynamic(() => import("./collaborative-whiteboard/Demo")),
  "meeting-captions": dynamic(() => import("./meeting-captions/Demo")),
  "trip-planner": dynamic(() => import("./trip-planner/Demo")),
  "room-planner": dynamic(() => import("./room-planner/Demo")),
  "brick-blaster": dynamic(() => import("./brick-blaster/Demo")),
};

export function Demo({ slug }: { slug: string }) {
  const Component = demos[slug];
  return Component ? <Component /> : null;
}
