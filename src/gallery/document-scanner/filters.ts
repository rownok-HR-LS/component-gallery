export type Filter = "original" | "enhanced" | "grayscale" | "bw";

const luma = (d: Uint8ClampedArray, i: number) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;

/** Stretches contrast so the darkest 1% become black and the brightest 1% become white. */
function autoLevels(img: ImageData) {
  const d = img.data;
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < d.length; i += 4) hist[luma(d, i) | 0]++;
  const total = d.length / 4;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < total * 0.01; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < total * 0.01; hi--);
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) d[i + c] = ((d[i + c] - lo) * 255) / range;
  }
}

/** Sum of luma over every rectangle in O(1): integral[(y)*(w+1)+x] = sum above-left of (x, y). */
function lumaIntegral(img: ImageData) {
  const { width: w, height: h, data: d } = img;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += luma(d, (y * w + x) * 4);
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  return integral;
}

function localMean(integral: Float64Array, w: number, h: number, x: number, y: number, half: number) {
  const x0 = Math.max(0, x - half);
  const x1 = Math.min(w, x + half + 1);
  const y0 = Math.max(0, y - half);
  const y1 = Math.min(h, y + half + 1);
  const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
  return sum / ((x1 - x0) * (y1 - y0));
}

/**
 * "Magic colour": estimate the bare paper colour everywhere (lighting + tint), then divide it out,
 * so the paper becomes evenly white while coloured ink like signatures and stamps keeps its colour.
 * The estimate is a tiny copy of the page, "dilated" with lighten-blending so dark ink drops out,
 * then scaled back up smoothly.
 */
function whitenPaper(img: ImageData) {
  const { width: w, height: h, data: d } = img;
  const full = document.createElement("canvas");
  full.width = w;
  full.height = h;
  full.getContext("2d")!.putImageData(img, 0, 0);

  const sw = Math.max(4, Math.round(w / 20));
  const sh = Math.max(4, Math.round(h / 20));
  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(full, 0, 0, sw, sh);
  // Local maximum (paper is the brightest thing nearby): blend shifted copies with "lighten".
  sctx.globalCompositeOperation = "lighten";
  for (let pass = 0; pass < 2; pass++) {
    const copy = document.createElement("canvas");
    copy.width = sw;
    copy.height = sh;
    copy.getContext("2d")!.drawImage(small, 0, 0);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) sctx.drawImage(copy, dx, dy);
  }

  const bg = document.createElement("canvas");
  bg.width = w;
  bg.height = h;
  const bctx = bg.getContext("2d", { willReadFrequently: true })!;
  bctx.imageSmoothingQuality = "high";
  bctx.filter = "blur(4px)";
  bctx.drawImage(small, 0, 0, w, h);
  const paper = bctx.getImageData(0, 0, w, h).data;

  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) d[i + c] = (d[i + c] / Math.max(30, paper[i + c])) * 255;
  }
}

function grayscale(img: ImageData) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = luma(d, i);
}

/**
 * Bradley adaptive threshold: each pixel is compared with the average of its neighbourhood
 * (from an integral image), so uneven lighting and shadows disappear.
 */
function adaptiveThreshold(img: ImageData) {
  const { width: w, height: h, data: d } = img;
  const integral = lumaIntegral(img);
  const half = Math.max(8, Math.round(w / 32));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = luma(d, i) < localMean(integral, w, h, x, y, half) * 0.86 ? 0 : 255;
    }
  }
}

export function applyFilter(img: ImageData, filter: Filter) {
  if (filter === "enhanced") whitenPaper(img);
  if (filter === "grayscale") {
    grayscale(img);
    autoLevels(img);
  }
  if (filter === "bw") adaptiveThreshold(img);
  return img;
}
