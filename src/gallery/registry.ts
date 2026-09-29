import type { ComponentType } from "react";
import LoanEmiCalculator from "./loan-emi-calculator/Demo";

export type GalleryEntry = {
  /** URL segment: /components/<slug>. Must match the folder name in src/gallery/. */
  slug: string;
  name: string;
  description: string;
  /** Challenge week the component was added in (1–13). */
  week: number;
  /** YYYY-MM-DD */
  addedOn: string;
  Demo: ComponentType;
};

// Add new components at the end. Every file in src/gallery/<slug>/ is shown as source on its page.
export const gallery: GalleryEntry[] = [
  {
    slug: "loan-emi-calculator",
    name: "Loan / EMI Calculator",
    description:
      "Sliders for loan amount, interest rate and term, with a live monthly payment and a donut chart of principal vs interest.",
    week: 1,
    addedOn: "2026-09-30",
    Demo: LoanEmiCalculator,
  },
];

export function getEntry(slug: string) {
  return gallery.find((entry) => entry.slug === slug);
}
