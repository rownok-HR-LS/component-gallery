// Component metadata. The demos themselves are mapped by slug in ./demos.tsx (lazy-loaded).
export type GalleryEntry = {
  /** URL segment: /components/<slug>. Must match the folder name in src/gallery/. */
  slug: string;
  name: string;
  description: string;
  /** Challenge week the component was added in (1–13). */
  week: number;
  /** YYYY-MM-DD */
  addedOn: string;
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
  },
  {
    slug: "unit-converter-dial",
    name: "Unit Converter Dial",
    description:
      "Spin a rotary knob to switch between distance, temperature and weight, then type in either box to convert live.",
    week: 1,
    addedOn: "2026-09-30",
  },
  {
    slug: "password-strength-meter",
    name: "Password Strength Meter",
    description:
      "Estimates how long a password would take to crack, spots common words and patterns, and gives one specific tip to make it stronger.",
    week: 2,
    addedOn: "2026-09-30",
  },
  {
    slug: "customer-lifetime-value",
    name: "Customer Lifetime Value Calculator",
    description:
      "Compares what a customer earns you over their lifetime with what it costs to win them, charts when they pay back, and tells you which lever gets you to a healthy 3 : 1.",
    week: 2,
    addedOn: "2026-09-30",
  },
  {
    slug: "photo-resizer",
    name: "Photo Resizer for Official Forms",
    description:
      "Crop, resize and compress a photo to the exact pixel size and KB limit a job, passport or visa form asks for, without it ever leaving your device.",
    week: 3,
    addedOn: "2026-10-07",
  },
  {
    slug: "morphing-submit-button",
    name: "Morphing Submit Button",
    description:
      "A submit button that shrinks into a spinner, then bursts into a self-drawing checkmark with confetti, or shakes red on error.",
    week: 3,
    addedOn: "2026-10-07",
  },
  {
    slug: "spin-the-wheel",
    name: "Spin-the-Wheel Picker",
    description:
      "Paste names and spin a wheel that slows down realistically, with a ticking pointer, blinking rim lights and a fair, cryptographically random winner.",
    week: 4,
    addedOn: "2026-10-08",
  },
  {
    slug: "stacking-toasts",
    name: "Stacking Toast Notifications",
    description:
      "Toasts that stack like cards, fan out on hover, pause their timers, swipe away, and turn loading into success, with Undo and Retry actions.",
    week: 4,
    addedOn: "2026-10-08",
  },
  {
    slug: "document-scanner",
    name: "Document Scanner",
    description:
      "Turn a phone photo of a page into a flat, clean scan: auto-detected corners, perspective correction, shadow-removing B&W filter and multi-page PDF export, all in the browser.",
    week: 5,
    addedOn: "2026-10-08",
  },
  {
    slug: "text-diff",
    name: "Text Diff Checker",
    description:
      "Compare two versions of a contract, policy or document with the Myers diff algorithm: line and word-level highlights, split or unified view, and jump between changes.",
    week: 5,
    addedOn: "2026-10-08",
  },
  {
    slug: "collaborative-whiteboard",
    name: "Collaborative Whiteboard",
    description:
      "A Miro-style infinite whiteboard: sticky notes, shapes, connectors, pen, frames, snapping, undo/redo, mini-map, templates, PNG/JSON export and live cursors across browser tabs.",
    week: 6,
    addedOn: "2026-10-08",
  },
  {
    slug: "meeting-captions",
    name: "Live Meeting Captions & Action Items",
    description:
      "Live speech-to-text captions with speaker turns, highlighted deadlines and money, and action items (owner + due date), decisions and questions extracted as people talk.",
    week: 6,
    addedOn: "2026-10-09",
  },
  {
    slug: "trip-planner",
    name: "Trip Planner with Live Map",
    description:
      "Plan a multi-day trip on a real map: search places, organise stops by day, see driving routes with times and distances, split the budget, pack, and share it with a link.",
    week: 7,
    addedOn: "2026-10-09",
  },
  {
    slug: "room-planner",
    name: "Room Planner, 2D to 3D",
    description:
      "Draw a room to scale, arrange real-size furniture with fit and door-swing warnings, then orbit or walk through it in 3D.",
    week: 7,
    addedOn: "2026-10-09",
  },
  {
    slug: "brick-blaster",
    name: "Brick Blaster (DX-Ball tribute)",
    description:
      "A polished DX-Ball-style brick breaker: 10 levels, strong, metal, explosive and mystery bricks, 10 power-ups including multi-ball, fireball and laser, particles and synth sound.",
    week: 8,
    addedOn: "2026-10-09",
  },
];

export function getEntry(slug: string) {
  return gallery.find((entry) => entry.slug === slug);
}
