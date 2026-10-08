export type Point = { x: number; y: number };
/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

/** Solves A·x = b with Gaussian elimination and partial pivoting. */
function solve(A: number[][], b: number[]) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c];
    x[r] = sum / M[r][r];
  }
  return x;
}

/** 3×3 perspective transform (row-major, h33 = 1) mapping each `from[i]` onto `to[i]`. */
export function homography(from: Point[], to: Point[]) {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(A, b), 1];
}

/**
 * For every pixel in the region of `dst`, looks up where it comes from in `src` through `H`
 * (dst → src) and samples bilinearly. Pixels that map outside `src` are left alone, or painted
 * white when `whiteOutside` is set.
 */
export function warp(
  src: ImageData,
  dst: ImageData,
  H: number[],
  region = { x0: 0, y0: 0, x1: dst.width, y1: dst.height },
  whiteOutside = true,
) {
  const s = src.data;
  const d = dst.data;
  const sw = src.width;
  const sh = src.height;
  for (let y = region.y0; y < region.y1; y++) {
    for (let x = region.x0; x < region.x1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w = H[6] * px + H[7] * py + H[8];
      const sx = (H[0] * px + H[1] * py + H[2]) / w - 0.5;
      const sy = (H[3] * px + H[4] * py + H[5]) / w - 0.5;
      const o = (y * dst.width + x) * 4;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        if (whiteOutside) d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 255;
        continue;
      }
      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * fx;
        const bottom = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * fx;
        d[o + c] = top + (bottom - top) * fy;
      }
      d[o + 3] = 255;
    }
  }
  return dst;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Real width ÷ height of the photographed rectangle, recovered from perspective
 * (Zhang & He, "Whiteboard scanning and image enhancement", 2006): estimate the camera's focal
 * length from the quad's vanishing geometry, assuming the optical centre is the image centre.
 * Returns null when the photo is too square-on for the maths to be stable.
 */
function perspectiveAspect([tl, tr, br, bl]: Quad, imageW: number, imageH: number) {
  const cx = imageW / 2;
  const cy = imageH / 2;
  const h = (p: Point): V3 => [p.x - cx, p.y - cy, 1];
  const m1 = h(tl);
  const m2 = h(tr);
  const m3 = h(bl);
  const m4 = h(br);
  const k2 = dot(cross(m1, m4), m3) / dot(cross(m2, m4), m3);
  const k3 = dot(cross(m1, m4), m2) / dot(cross(m3, m4), m2);
  const n2: V3 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
  const n3: V3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
  if (Math.abs(n2[2]) < 1e-6 || Math.abs(n3[2]) < 1e-6) return null;
  const f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
  if (!(f2 > 0)) return null;
  const len = (n: V3) => (n[0] * n[0] + n[1] * n[1]) / f2 + n[2] * n[2];
  const ratio = Math.sqrt(len(n2) / len(n3));
  return Number.isFinite(ratio) && ratio > 0.1 && ratio < 10 ? ratio : null;
}

/**
 * Size of the flattened page. Width comes from the longer horizontal edge; height comes from the
 * perspective-recovered aspect ratio when available, otherwise from the longer vertical edge.
 */
export function quadSize(quad: Quad, imageW = 0, imageH = 0) {
  const [tl, tr, br, bl] = quad;
  const w = Math.max(dist(tl, tr), dist(bl, br));
  const h = Math.max(dist(tl, bl), dist(tr, br));
  const ratio = imageW && imageH ? perspectiveAspect(quad, imageW, imageH) : null;
  return ratio ? { w, h: w / ratio } : { w, h };
}

/** Flattens the area inside `quad` into a w×h image. */
export function flatten(src: ImageData, quad: Quad, w: number, h: number) {
  const rect = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  return warp(src, new ImageData(w, h), homography(rect, quad));
}

/**
 * Guesses the page corners: Otsu-threshold a small greyscale copy, keep the largest bright blob,
 * then take its extreme points along the two diagonals. Returns null if nothing page-like is found.
 */
export function detectPage(img: ImageData): Quad | null {
  const { width: w, height: h, data } = img;
  const gray = new Uint8Array(w * h);
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < w * h; i++) {
    const g = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) | 0;
    gray[i] = g;
    hist[g]++;
  }

  // Otsu: the threshold that best separates two brightness classes.
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = w * h - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }

  // Largest 4-connected bright component.
  const label = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let bestId = -1;
  let bestSize = 0;
  let id = 0;
  for (let start = 0; start < w * h; start++) {
    if (gray[start] <= threshold || label[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = id;
    while (head < tail) {
      const p = queue[head++];
      const px = p % w;
      const neighbours = [px > 0 ? p - 1 : -1, px < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of neighbours) {
        if (q < 0 || q >= w * h || label[q] !== -1 || gray[q] <= threshold) continue;
        label[q] = id;
        queue[tail++] = q;
      }
    }
    if (tail > bestSize) {
      bestSize = tail;
      bestId = id;
    }
    id++;
  }
  if (bestId < 0 || bestSize < w * h * 0.12) return null;

  let tl = { x: 0, y: 0, s: Infinity };
  let br = { x: 0, y: 0, s: -Infinity };
  let tr = { x: 0, y: 0, s: -Infinity };
  let bl = { x: 0, y: 0, s: Infinity };
  for (let p = 0; p < w * h; p++) {
    if (label[p] !== bestId) continue;
    const x = p % w;
    const y = (p / w) | 0;
    if (x + y < tl.s) tl = { x, y, s: x + y };
    if (x + y > br.s) br = { x, y, s: x + y };
    if (x - y > tr.s) tr = { x, y, s: x - y };
    if (x - y < bl.s) bl = { x, y, s: x - y };
  }
  return [tl, tr, br, bl].map(({ x, y }) => ({ x, y })) as Quad;
}
