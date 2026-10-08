import { bounds, connectorPoints, union } from "./geometry";
import { fitFont, INK, type El } from "./model";

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (ctx.measureText(next).width > maxWidth && line.trim()) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  size: number,
  align: "center" | "left",
  color = INK,
) {
  ctx.font = `500 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const lines = wrap(ctx, text, w - 16);
  const lh = size * 1.25;
  const top = align === "center" ? y + h / 2 - ((lines.length - 1) * lh) / 2 : y + size * 0.7;
  lines.forEach((l, i) => ctx.fillText(l, align === "center" ? x + w / 2 : x, top + i * lh));
}

/** Renders the board with the 2D canvas API (no foreignObject, so it never taints the canvas). */
export function exportPng(elements: El[], dark: boolean) {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const box = union(elements.map((e) => bounds(e, byId)));
  if (!box) return Promise.resolve(null);
  const pad = 48;
  const scale = Math.min(2, 8000 / Math.max(box.w + pad * 2, box.h + pad * 2));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((box.w + pad * 2) * scale);
  canvas.height = Math.ceil((box.h + pad * 2) * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.translate(pad - box.x, pad - box.y);
  ctx.fillStyle = dark ? "#16161a" : "#f7f7f5";
  ctx.fillRect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2);

  const ordered = [...elements.filter((e) => e.type === "frame"), ...elements.filter((e) => e.type !== "frame")];
  for (const el of ordered) {
    ctx.save();
    if (el.type === "frame") {
      ctx.fillStyle = dark ? "#202026" : "#ffffff";
      ctx.strokeStyle = dark ? "#3a3a44" : "#d9d8d2";
      ctx.lineWidth = 1.5;
      ctx.fillRect(el.x, el.y, el.w, el.h);
      ctx.strokeRect(el.x, el.y, el.w, el.h);
      ctx.font = '600 15px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = dark ? "#c3c2b7" : "#52514e";
      ctx.textBaseline = "bottom";
      ctx.fillText(el.title, el.x, el.y - 8);
    }
    if (el.type === "sticky") {
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = el.color;
      ctx.fillRect(el.x, el.y, el.w, el.h);
      ctx.shadowColor = "transparent";
      drawText(ctx, el.text, el.x, el.y, el.w, el.h, fitFont(el.text, el.w, el.h), "center");
    }
    if (el.type === "shape") {
      ctx.fillStyle = el.color;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (el.kind === "rect") ctx.roundRect(el.x, el.y, el.w, el.h, 10);
      if (el.kind === "ellipse") ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
      if (el.kind === "diamond") {
        ctx.moveTo(el.x + el.w / 2, el.y);
        ctx.lineTo(el.x + el.w, el.y + el.h / 2);
        ctx.lineTo(el.x + el.w / 2, el.y + el.h);
        ctx.lineTo(el.x, el.y + el.h / 2);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
      drawText(ctx, el.text, el.x, el.y, el.w, el.h, fitFont(el.text, el.w * 0.8, el.h * 0.8, 20), "center");
    }
    if (el.type === "text") drawText(ctx, el.text, el.x, el.y, el.w + 16, el.h, 22, "left", dark ? "#f4f4f5" : INK);
    if (el.type === "path") {
      ctx.strokeStyle = el.color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i < el.points.length; i += 2) {
        if (i) ctx.lineTo(el.points[i], el.points[i + 1]);
        else ctx.moveTo(el.points[i], el.points[i + 1]);
      }
      ctx.stroke();
    }
    if (el.type === "connector") {
      const { a, b } = connectorPoints(el, byId);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.strokeStyle = ctx.fillStyle = el.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x - Math.cos(ang) * 8, b.y - Math.sin(ang) * 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - Math.cos(ang - 0.45) * 13, b.y - Math.sin(ang - 0.45) * 13);
      ctx.lineTo(b.x - Math.cos(ang + 0.45) * 13, b.y - Math.sin(ang + 0.45) * 13);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}
