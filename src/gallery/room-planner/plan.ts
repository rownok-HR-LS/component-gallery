// Plan model in centimetres. The room spans x ∈ [0, w], y ∈ [0, d] (y grows "down" on the plan).

export type Wall = "top" | "right" | "bottom" | "left";
export type Opening = { id: string; type: "door" | "window"; wall: Wall; offset: number; width: number; hinge: "start" | "end" };
export type Item = { id: string; kind: string; label: string; x: number; y: number; w: number; d: number; h: number; rot: number; color: string };
export type Room = { w: number; d: number; h: number };
export type Plan = { room: Room; openings: Opening[]; items: Item[] };

export type CatalogEntry = { kind: string; label: string; w: number; d: number; h: number; color: string; group: string };

export const CATALOG: CatalogEntry[] = [
  { kind: "bed", label: "Single bed", w: 100, d: 200, h: 50, color: "#8a6a50", group: "Bedroom" },
  { kind: "bed", label: "Double bed", w: 140, d: 200, h: 50, color: "#8a6a50", group: "Bedroom" },
  { kind: "bed", label: "Queen bed", w: 160, d: 210, h: 50, color: "#8a6a50", group: "Bedroom" },
  { kind: "wardrobe", label: "Wardrobe", w: 120, d: 60, h: 200, color: "#c9b79c", group: "Bedroom" },
  { kind: "dresser", label: "Dresser", w: 100, d: 45, h: 80, color: "#c9b79c", group: "Bedroom" },
  { kind: "side", label: "Side table", w: 45, d: 45, h: 55, color: "#a0785a", group: "Bedroom" },
  { kind: "sofa", label: "2-seat sofa", w: 150, d: 85, h: 85, color: "#5b7fa6", group: "Living" },
  { kind: "sofa", label: "3-seat sofa", w: 210, d: 90, h: 85, color: "#5b7fa6", group: "Living" },
  { kind: "armchair", label: "Armchair", w: 80, d: 80, h: 85, color: "#b86b5a", group: "Living" },
  { kind: "table", label: "Coffee table", w: 110, d: 60, h: 45, color: "#a0785a", group: "Living" },
  { kind: "tv", label: "TV unit", w: 160, d: 40, h: 50, color: "#3d3d42", group: "Living" },
  { kind: "shelf", label: "Bookshelf", w: 80, d: 30, h: 180, color: "#c9b79c", group: "Living" },
  { kind: "table", label: "Dining table", w: 140, d: 85, h: 75, color: "#a0785a", group: "Dining & work" },
  { kind: "chair", label: "Chair", w: 45, d: 50, h: 90, color: "#6b6f76", group: "Dining & work" },
  { kind: "table", label: "Desk", w: 120, d: 60, h: 75, color: "#d8cdb9", group: "Dining & work" },
  { kind: "rug", label: "Rug", w: 200, d: 140, h: 1, color: "#c98b6b", group: "Decor" },
  { kind: "plant", label: "Plant", w: 40, d: 40, h: 120, color: "#3f8f5a", group: "Decor" },
];

export const COLORS = ["#8a6a50", "#c9b79c", "#5b7fa6", "#b86b5a", "#3f8f5a", "#3d3d42", "#d8cdb9", "#e3c66a"];

let n = 0;
export const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function makeItem(entry: CatalogEntry, x: number, y: number, rot = 0): Item {
  return { id: uid(), kind: entry.kind, label: entry.label, x, y, w: entry.w, d: entry.d, h: entry.h, rot, color: entry.color };
}
const pick = (label: string) => CATALOG.find((c) => c.label === label)!;

export const TEMPLATES: { key: string; label: string; build: () => Plan }[] = [
  {
    key: "bedroom",
    label: "Bedroom 3.6 × 4.0 m",
    build: () => ({
      room: { w: 360, d: 400, h: 270 },
      openings: [
        { id: uid(), type: "door", wall: "bottom", offset: 250, width: 85, hinge: "end" },
        { id: uid(), type: "window", wall: "top", offset: 110, width: 140, hinge: "start" },
      ],
      items: [
        makeItem(pick("Rug"), 150, 175),
        makeItem(pick("Queen bed"), 150, 125),
        makeItem(pick("Side table"), 45, 40),
        makeItem(pick("Side table"), 255, 40),
        makeItem(pick("Wardrobe"), 330, 210, 90),
        makeItem(pick("Desk"), 70, 360, 180),
        makeItem(pick("Chair"), 70, 300),
        makeItem(pick("Plant"), 335, 30),
      ],
    }),
  },
  {
    key: "living",
    label: "Living room 4.5 × 5.5 m",
    build: () => ({
      room: { w: 450, d: 550, h: 280 },
      openings: [
        { id: uid(), type: "door", wall: "left", offset: 430, width: 90, hinge: "end" },
        { id: uid(), type: "window", wall: "top", offset: 150, width: 160, hinge: "start" },
        { id: uid(), type: "window", wall: "right", offset: 120, width: 120, hinge: "start" },
      ],
      items: [
        makeItem(pick("Rug"), 225, 170),
        makeItem(pick("3-seat sofa"), 225, 255, 180),
        makeItem(pick("Armchair"), 80, 160, 90),
        makeItem(pick("Coffee table"), 225, 170),
        makeItem(pick("TV unit"), 225, 25),
        makeItem(pick("Bookshelf"), 430, 300, 270),
        makeItem(pick("Plant"), 30, 30),
        makeItem(pick("Dining table"), 290, 440),
        makeItem(pick("Chair"), 250, 370),
        makeItem(pick("Chair"), 330, 370),
        makeItem(pick("Chair"), 250, 510, 180),
        makeItem(pick("Chair"), 330, 510, 180),
      ],
    }),
  },
  { key: "empty", label: "Empty room 4 × 4 m", build: () => ({ room: { w: 400, d: 400, h: 270 }, openings: [], items: [] }) },
];

// ── Geometry ──────────────────────────────────────────────────────────────────────────
export type Pt = { x: number; y: number };

export function corners(it: Pick<Item, "x" | "y" | "w" | "d" | "rot">): Pt[] {
  const r = (it.rot * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    [-it.w / 2, -it.d / 2],
    [it.w / 2, -it.d / 2],
    [it.w / 2, it.d / 2],
    [-it.w / 2, it.d / 2],
  ].map(([x, y]) => ({ x: it.x + x * c - y * s, y: it.y + x * s + y * c }));
}

export function aabb(it: Pick<Item, "x" | "y" | "w" | "d" | "rot">) {
  const pts = corners(it);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Separating-axis test for two convex polygons (shrunk by 0.5 cm so touching isn't overlapping). */
export function overlaps(a: Pt[], b: Pt[]) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      const len = Math.hypot(nx, ny) || 1;
      const project = (pts: Pt[]) => pts.map((v) => (v.x * nx + v.y * ny) / len);
      const pa = project(a);
      const pb = project(b);
      if (Math.max(...pa) - 0.5 <= Math.min(...pb) || Math.max(...pb) - 0.5 <= Math.min(...pa)) return false;
    }
  }
  return true;
}

/** Where an opening sits on the plan: its two end points along the wall. */
export function openingSpan(o: Opening, room: Room) {
  const a = o.offset;
  const b = o.offset + o.width;
  switch (o.wall) {
    case "top":
      return { p: { x: a, y: 0 }, q: { x: b, y: 0 }, inward: { x: 0, y: 1 } };
    case "bottom":
      return { p: { x: a, y: room.d }, q: { x: b, y: room.d }, inward: { x: 0, y: -1 } };
    case "left":
      return { p: { x: 0, y: a }, q: { x: 0, y: b }, inward: { x: 1, y: 0 } };
    default:
      return { p: { x: room.w, y: a }, q: { x: room.w, y: b }, inward: { x: -1, y: 0 } };
  }
}

/** The square a door sweeps through as it opens into the room. */
export function swingZone(o: Opening, room: Room): Pt[] {
  const { p, q, inward } = openingSpan(o, room);
  const dx = inward.x * o.width;
  const dy = inward.y * o.width;
  return [p, q, { x: q.x + dx, y: q.y + dy }, { x: p.x + dx, y: p.y + dy }];
}

export const wallLength = (wall: Wall, room: Room) => (wall === "top" || wall === "bottom" ? room.w : room.d);

export type Problem = { id: string; message: string };

export function findProblems(plan: Plan): Problem[] {
  const out: Problem[] = [];
  const solid = plan.items.filter((i) => i.kind !== "rug");
  const polys = new Map(plan.items.map((i) => [i.id, corners(i)]));
  for (const it of plan.items) {
    const b = aabb(it);
    if (b.x0 < -0.5 || b.y0 < -0.5 || b.x1 > plan.room.w + 0.5 || b.y1 > plan.room.d + 0.5) {
      out.push({ id: it.id, message: `${it.label} sticks out of the room` });
    }
  }
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      if (overlaps(polys.get(solid[i].id)!, polys.get(solid[j].id)!)) {
        out.push({ id: solid[i].id, message: `${solid[i].label} overlaps ${solid[j].label}` });
        out.push({ id: solid[j].id, message: "" });
      }
    }
  }
  for (const o of plan.openings) {
    if (o.type !== "door") continue;
    const zone = swingZone(o, plan.room);
    for (const it of solid) {
      if (overlaps(zone, polys.get(it.id)!)) out.push({ id: it.id, message: `${it.label} blocks the door` });
    }
  }
  return out;
}
