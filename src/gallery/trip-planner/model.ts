export type Category = "sight" | "food" | "hotel" | "transport" | "shop" | "other";
export type Stop = { id: string; name: string; lat: number; lng: number; category: Category; time: string; cost: number; note: string };
export type Day = { id: string; stops: Stop[] };
export type Extra = { id: string; label: string; cost: number };
export type PackItem = { id: string; label: string; done: boolean };
export type Trip = { name: string; start: string; travelers: number; days: Day[]; extras: Extra[]; packing: PackItem[] };

export const DAY_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#7c4dff", "#e2508a", "#0e9aa7", "#c98500"];
export const CATEGORIES: { key: Category; label: string }[] = [
  { key: "sight", label: "Sightseeing" },
  { key: "food", label: "Food" },
  { key: "hotel", label: "Stay" },
  { key: "transport", label: "Transport" },
  { key: "shop", label: "Shopping" },
  { key: "other", label: "Other" },
];

let n = 0;
export const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const stop = (name: string, lat: number, lng: number, category: Category, time = "", cost = 0, note = ""): Stop => ({
  id: uid(),
  name,
  lat,
  lng,
  category,
  time,
  cost,
  note,
});

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayDate(trip: Trip, index: number) {
  const [y, m, d] = trip.start.split("-").map(Number);
  return new Date(y, m - 1, d + index);
}

/** A ready-made 3-day Cox's Bazar trip so the planner is useful on first open. */
export function sampleTrip(): Trip {
  const start = new Date();
  start.setDate(start.getDate() + 14);
  return {
    name: "Cox's Bazar weekend",
    start: isoDate(start),
    travelers: 4,
    days: [
      {
        id: uid(),
        stops: [
          stop("Cox's Bazar Airport", 21.4522, 91.9639, "transport", "10:30", 0, "Flight from Dhaka"),
          stop("Hotel in Kolatoli", 21.4116, 91.9841, "hotel", "12:00", 14000, "2 rooms × 2 nights"),
          stop("Laboni Point Beach", 21.4237, 91.9733, "sight", "16:30", 0, "Sunset walk"),
          stop("Burmese Market", 21.4396, 91.9781, "shop", "19:00", 2500),
        ],
      },
      {
        id: uid(),
        stops: [
          stop("Himchari National Park", 21.3577, 92.0233, "sight", "09:00", 400, "Waterfall + hilltop view"),
          stop("Inani Beach", 21.2236, 92.0498, "sight", "11:30", 0, "Coral stones at low tide"),
          stop("Seafood lunch on Marine Drive", 21.2785, 92.0447, "food", "13:30", 3200),
          stop("Hotel in Kolatoli", 21.4116, 91.9841, "hotel", "17:00", 0),
        ],
      },
      {
        id: uid(),
        stops: [
          stop("Ramu Buddhist Temple", 21.4247, 92.1006, "sight", "09:30", 0),
          stop("Dried-fish market", 21.4482, 91.9729, "shop", "12:00", 1500),
          stop("Cox's Bazar Airport", 21.4522, 91.9639, "transport", "15:00", 0, "Flight back"),
        ],
      },
    ],
    extras: [
      { id: uid(), label: "Return flights (4)", cost: 26000 },
      { id: uid(), label: "CNG & tuk-tuk rides", cost: 3000 },
    ],
    packing: [
      "NID / passport",
      "Phone charger & power bank",
      "Sunscreen",
      "Sunglasses & hat",
      "Swimwear",
      "Flip-flops",
      "Light cotton clothes",
      "Medicines",
      "Cash for markets",
    ].map((label, i) => ({ id: uid(), label, done: i < 2 })),
  };
}

// ── Share links: the whole trip, gzip-compressed into the URL hash ────────────────────
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function encodeTrip(trip: Trip) {
  const json = new TextEncoder().encode(JSON.stringify(trip));
  if (typeof CompressionStream === "undefined") return `j.${toB64(json)}`;
  return `z.${toB64(await pipe(json, new CompressionStream("gzip")))}`;
}

export async function decodeTrip(code: string): Promise<Trip | null> {
  try {
    const [kind, data] = [code.slice(0, 1), code.slice(2)];
    const bytes = kind === "z" ? await pipe(fromB64(data), new DecompressionStream("gzip")) : fromB64(data);
    const trip = JSON.parse(new TextDecoder().decode(bytes));
    return Array.isArray(trip?.days) ? trip : null;
  } catch {
    return null;
  }
}

/** An .ics calendar: one all-day overview per day plus a 1-hour event for every timed stop. */
export function toIcs(trip: Trip) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const ymd = (d: Date) => isoDate(d).replace(/-/g, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Component Gallery//Trip Planner//EN", "CALSCALE:GREGORIAN"];
  trip.days.forEach((day, i) => {
    const date = dayDate(trip, i);
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${day.id}@trip`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(date)}`,
      `DTEND;VALUE=DATE:${ymd(next)}`,
      `SUMMARY:${esc(`${trip.name}: Day ${i + 1}`)}`,
      `DESCRIPTION:${esc(day.stops.map((s, j) => `${j + 1}. ${s.time ? `${s.time} ` : ""}${s.name}`).join("\n"))}`,
      "END:VEVENT",
    );
    for (const s of day.stops) {
      if (!s.time) continue;
      const [h, m] = s.time.split(":").map(Number);
      const startAt = `${ymd(date)}T${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00`;
      const endAt = `${ymd(date)}T${String((h + 1) % 24).padStart(2, "0")}${String(m).padStart(2, "0")}00`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${s.id}-${i}@trip`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${startAt}`,
        `DTEND:${endAt}`,
        `SUMMARY:${esc(s.name)}`,
        `LOCATION:${esc(`${s.lat.toFixed(5)},${s.lng.toFixed(5)}`)}`,
        ...(s.note ? [`DESCRIPTION:${esc(s.note)}`] : []),
        "END:VEVENT",
      );
    }
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
