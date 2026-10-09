"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

// Lazy-loaded games (client module so each page only downloads the game it shows).
const games: Record<string, ComponentType> = {
  "brick-blaster": dynamic(() => import("./brick-blaster/Demo")),
};

export function GameDemo({ slug }: { slug: string }) {
  const Component = games[slug];
  return Component ? <Component /> : null;
}
