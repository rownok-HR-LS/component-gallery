import type { ComponentType } from "react";
import LoanEmiCalculator from "./loan-emi-calculator/Demo";
import UnitConverterDial from "./unit-converter-dial/Demo";
import PasswordStrengthMeter from "./password-strength-meter/Demo";
import CustomerLifetimeValue from "./customer-lifetime-value/Demo";
import PhotoResizer from "./photo-resizer/Demo";
import MorphingSubmitButton from "./morphing-submit-button/Demo";
import SpinTheWheel from "./spin-the-wheel/Demo";
import StackingToasts from "./stacking-toasts/Demo";
import DocumentScanner from "./document-scanner/Demo";
import TextDiff from "./text-diff/Demo";
import CollaborativeWhiteboard from "./collaborative-whiteboard/Demo";
import MeetingCaptions from "./meeting-captions/Demo";

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
  {
    slug: "unit-converter-dial",
    name: "Unit Converter Dial",
    description:
      "Spin a rotary knob to switch between distance, temperature and weight, then type in either box to convert live.",
    week: 1,
    addedOn: "2026-09-30",
    Demo: UnitConverterDial,
  },
  {
    slug: "password-strength-meter",
    name: "Password Strength Meter",
    description:
      "Estimates how long a password would take to crack, spots common words and patterns, and gives one specific tip to make it stronger.",
    week: 2,
    addedOn: "2026-09-30",
    Demo: PasswordStrengthMeter,
  },
  {
    slug: "customer-lifetime-value",
    name: "Customer Lifetime Value Calculator",
    description:
      "Compares what a customer earns you over their lifetime with what it costs to win them, charts when they pay back, and tells you which lever gets you to a healthy 3 : 1.",
    week: 2,
    addedOn: "2026-09-30",
    Demo: CustomerLifetimeValue,
  },
  {
    slug: "photo-resizer",
    name: "Photo Resizer for Official Forms",
    description:
      "Crop, resize and compress a photo to the exact pixel size and KB limit a job, passport or visa form asks for, without it ever leaving your device.",
    week: 3,
    addedOn: "2026-10-07",
    Demo: PhotoResizer,
  },
  {
    slug: "morphing-submit-button",
    name: "Morphing Submit Button",
    description:
      "A submit button that shrinks into a spinner, then bursts into a self-drawing checkmark with confetti, or shakes red on error.",
    week: 3,
    addedOn: "2026-10-07",
    Demo: MorphingSubmitButton,
  },
  {
    slug: "spin-the-wheel",
    name: "Spin-the-Wheel Picker",
    description:
      "Paste names and spin a wheel that slows down realistically, with a ticking pointer, blinking rim lights and a fair, cryptographically random winner.",
    week: 4,
    addedOn: "2026-10-08",
    Demo: SpinTheWheel,
  },
  {
    slug: "stacking-toasts",
    name: "Stacking Toast Notifications",
    description:
      "Toasts that stack like cards, fan out on hover, pause their timers, swipe away, and turn loading into success, with Undo and Retry actions.",
    week: 4,
    addedOn: "2026-10-08",
    Demo: StackingToasts,
  },
  {
    slug: "document-scanner",
    name: "Document Scanner",
    description:
      "Turn a phone photo of a page into a flat, clean scan: auto-detected corners, perspective correction, shadow-removing B&W filter and multi-page PDF export, all in the browser.",
    week: 5,
    addedOn: "2026-10-08",
    Demo: DocumentScanner,
  },
  {
    slug: "text-diff",
    name: "Text Diff Checker",
    description:
      "Compare two versions of a contract, policy or document with the Myers diff algorithm: line and word-level highlights, split or unified view, and jump between changes.",
    week: 5,
    addedOn: "2026-10-08",
    Demo: TextDiff,
  },
  {
    slug: "collaborative-whiteboard",
    name: "Collaborative Whiteboard",
    description:
      "A Miro-style infinite whiteboard: sticky notes, shapes, connectors, pen, frames, snapping, undo/redo, mini-map, templates, PNG/JSON export and live cursors across browser tabs.",
    week: 6,
    addedOn: "2026-10-08",
    Demo: CollaborativeWhiteboard,
  },
  {
    slug: "meeting-captions",
    name: "Live Meeting Captions & Action Items",
    description:
      "Live speech-to-text captions with speaker turns, highlighted deadlines and money, and action items (owner + due date), decisions and questions extracted as people talk.",
    week: 6,
    addedOn: "2026-10-09",
    Demo: MeetingCaptions,
  },
];

export function getEntry(slug: string) {
  return gallery.find((entry) => entry.slug === slug);
}
