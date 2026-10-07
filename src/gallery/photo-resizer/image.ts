function toJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))), "image/jpeg", quality),
  );
}

/** Highest JPEG quality that fits under `maxKB` (binary search), or 0.92 when there is no limit. */
export async function compressToLimit(canvas: HTMLCanvasElement, maxKB: number | null) {
  const best = await toJpeg(canvas, 0.92);
  if (maxKB === null || best.size <= maxKB * 1024) return { blob: best, quality: 0.92 };

  let lo = 0.05;
  let hi = 0.92;
  let found: { blob: Blob; quality: number } | null = null;
  for (let i = 0; i < 7; i++) {
    const quality = (lo + hi) / 2;
    const blob = await toJpeg(canvas, quality);
    if (blob.size <= maxKB * 1024) {
      found = { blob, quality };
      lo = quality;
    } else {
      hi = quality;
    }
  }
  return found ?? { blob: await toJpeg(canvas, 0.05), quality: 0.05 };
}

/** A simple illustrated portrait so the demo works without uploading anything. */
export function drawSamplePortrait() {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1100;
  const ctx = canvas.getContext("2d")!;

  const bg = ctx.createLinearGradient(0, 0, 900, 1100);
  bg.addColorStop(0, "#9ec5f4");
  bg.addColorStop(1, "#cde2fb");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 900, 1100);

  // Shoulders and collar
  ctx.fillStyle = "#1c3557";
  ctx.beginPath();
  ctx.ellipse(450, 1100, 380, 300, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(380, 820);
  ctx.lineTo(450, 930);
  ctx.lineTo(520, 820);
  ctx.closePath();
  ctx.fill();

  // Neck and face
  ctx.fillStyle = "#c98d63";
  ctx.fillRect(400, 640, 100, 200);
  ctx.fillStyle = "#d9a07a";
  ctx.beginPath();
  ctx.ellipse(450, 520, 170, 210, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = "#231a14";
  ctx.beginPath();
  ctx.ellipse(450, 400, 185, 130, 0, Math.PI, 0);
  ctx.fill();

  // Eyes and smile
  ctx.fillStyle = "#231a14";
  for (const x of [385, 515]) {
    ctx.beginPath();
    ctx.ellipse(x, 520, 14, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#8a4b33";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(450, 600, 60, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();

  return new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.95));
}
