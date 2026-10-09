// Games are side projects, kept separate from the weekly component challenge:
// they don't count toward the 30 components and have no challenge week.
// The playable demos are mapped by slug in ./demos.tsx (lazy-loaded).
export type GameEntry = {
  /** URL segment: /games/<slug>. Must match the folder name in src/games/. */
  slug: string;
  name: string;
  description: string;
  /** Short line shown on the poster card. */
  tagline: string;
  /** YYYY-MM-DD */
  addedOn: string;
};

export const games: GameEntry[] = [
  {
    slug: "brick-blaster",
    name: "Brick Blaster",
    description:
      "A DX-Ball-style brick breaker set in a hellscape: 10 levels, strong, metal, explosive and mystery bricks, 10 power-ups including multi-ball, fireball and laser. Plays full screen on phones.",
    tagline: "A tribute to the classic DX-Ball",
    addedOn: "2026-10-09",
  },
];

export function getGame(slug: string) {
  return games.find((game) => game.slug === slug);
}
