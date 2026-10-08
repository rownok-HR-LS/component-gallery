import { isBox, type Box, type BoxEl, type Connector, type El, type End } from "./model";

export type Pt = { x: number; y: number };

export const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

export function union(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const intersects = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const contains = (b: Box, p: Pt) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** Where a ray from the element's centre towards `toward` leaves its outline. */
export function boundaryPoint(el: BoxEl, toward: Pt): Pt {
  const c = center(el);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const rx = el.w / 2;
  const ry = el.h / 2;
  let t: number;
  if (el.type === "shape" && el.kind === "ellipse") t = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
  else if (el.type === "shape" && el.kind === "diamond") t = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry);
  else t = Math.min(dx ? rx / Math.abs(dx) : Infinity, dy ? ry / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Screen-ready endpoints of a connector, following any elements it is pinned to. */
export function connectorPoints(c: Connector, byId: Map<string, El>) {
  const pinned = (end: End) => {
    const el = end.id ? byId.get(end.id) : undefined;
    return el && isBox(el) ? el : undefined;
  };
  const a = pinned(c.from);
  const b = pinned(c.to);
  const aRef = a ? center(a) : { x: c.from.x, y: c.from.y };
  const bRef = b ? center(b) : { x: c.to.x, y: c.to.y };
  return { a: a ? boundaryPoint(a, bRef) : aRef, b: b ? boundaryPoint(b, aRef) : bRef };
}

export function bounds(el: El, byId: Map<string, El>): Box {
  if (isBox(el)) return el;
  const { a, b } = connectorPoints(el, byId);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function move(el: El, dx: number, dy: number): El {
  if (el.type === "connector") {
    const shift = (e: End): End => (e.id ? e : { x: e.x + dx, y: e.y + dy });
    return { ...el, from: shift(el.from), to: shift(el.to) };
  }
  if (el.type === "path") {
    return { ...el, x: el.x + dx, y: el.y + dy, points: el.points.map((v, i) => v + (i % 2 ? dy : dx)) };
  }
  return { ...el, x: el.x + dx, y: el.y + dy };
}

export function resize(el: BoxEl, next: Box): BoxEl {
  if (el.type !== "path") return { ...el, ...next };
  const sx = el.w ? next.w / el.w : 1;
  const sy = el.h ? next.h / el.h : 1;
  return { ...el, ...next, points: el.points.map((v, i) => (i % 2 ? next.y + (v - el.y) * sy : next.x + (v - el.x) * sx)) };
}

export function pathBox(points: number[]): Box {
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
}

/** Smooth SVG path through freehand points (quadratic curves through the midpoints). */
export function smoothPath(points: number[]) {
  if (points.length < 4) return points.length ? `M${points[0]},${points[1]} l0.1,0` : "";
  let d = `M${points[0]},${points[1]}`;
  for (let i = 2; i < points.length - 2; i += 2) {
    const mx = (points[i] + points[i + 2]) / 2;
    const my = (points[i + 1] + points[i + 3]) / 2;
    d += ` Q${points[i]},${points[i + 1]} ${mx},${my}`;
  }
  return `${d} L${points[points.length - 2]},${points[points.length - 1]}`;
}

/**
 * Snap a moving box to other boxes' edges and centres. Returns the corrected offset and the
 * guide lines to draw (world coordinates).
 */
export function snap(moving: Box, others: Box[], threshold: number) {
  const xs = (b: Box) => [b.x, b.x + b.w / 2, b.x + b.w];
  const ys = (b: Box) => [b.y, b.y + b.h / 2, b.y + b.h];
  // Closest edge/centre alignment on each axis.
  const best = (mine: number[], theirs: (b: Box) => number[]) => {
    let found: { d: number; v: number } | null = null;
    for (const o of others) {
      for (const a of mine) {
        for (const b of theirs(o)) {
          if (Math.abs(b - a) <= threshold && (!found || Math.abs(b - a) < Math.abs(found.d))) found = { d: b - a, v: b };
        }
      }
    }
    return found;
  };
  const sx = best(xs(moving), xs);
  const sy = best(ys(moving), ys);
  const guides: { x?: number; y?: number }[] = [];
  if (sx) guides.push({ x: sx.v });
  if (sy) guides.push({ y: sy.v });
  return { dx: sx?.d ?? 0, dy: sy?.d ?? 0, guides };
}
