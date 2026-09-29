import type { ComponentType } from "react";

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
export const gallery: GalleryEntry[] = [];

export function getEntry(slug: string) {
  return gallery.find((entry) => entry.slug === slug);
}
