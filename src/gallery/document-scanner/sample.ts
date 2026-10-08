import { homography, warp } from "./geometry";

const PAGE = { w: 850, h: 1100 };

function drawLetter() {
  const c = document.createElement("canvas");
  c.width = PAGE.w;
  c.height = PAGE.h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fbfaf6";
  ctx.fillRect(0, 0, PAGE.w, PAGE.h);

  ctx.fillStyle = "#1c3557";
  ctx.font = "bold 40px Georgia, serif";
  ctx.fillText("ACME LTD.", 70, 110);
  ctx.font = "18px Georgia, serif";
  ctx.fillStyle = "#555";
  ctx.fillText("House 12, Road 7, Gulshan, Dhaka", 70, 140);
  ctx.fillStyle = "#1c3557";
  ctx.fillRect(70, 160, 710, 3);

  ctx.fillStyle = "#222";
  ctx.font = "bold 30px Georgia, serif";
  ctx.fillText("Salary Certificate", 70, 240);
  ctx.font = "20px Georgia, serif";
  ctx.fillText("Date: 15 October 2026", 70, 285);

  const body = [
    "This is to certify that Ms. Nusrat Jahan has been working",
    "with Acme Ltd. as HR Executive since 1 March 2024.",
    "",
    "Her current monthly salary is as follows:",
  ];
  body.forEach((line, i) => ctx.fillText(line, 70, 350 + i * 36));

  const rows = [
    ["Basic salary", "BDT 30,000"],
    ["House rent", "BDT 15,000"],
    ["Medical allowance", "BDT 3,500"],
    ["Transport", "BDT 3,500"],
    ["Gross monthly salary", "BDT 52,000"],
  ];
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1.5;
  rows.forEach(([label, value], i) => {
    const y = 520 + i * 48;
    ctx.strokeRect(70, y, 710, 48);
    ctx.font = i === rows.length - 1 ? "bold 20px Georgia, serif" : "20px Georgia, serif";
    ctx.fillText(label, 90, y + 31);
    ctx.fillText(value, 600, y + 31);
  });
  ctx.beginPath();
  ctx.moveTo(560, 520);
  ctx.lineTo(560, 520 + rows.length * 48);
  ctx.stroke();

  ctx.font = "20px Georgia, serif";
  ctx.fillText("This certificate is issued at her request.", 70, 820);

  // Signature and stamp
  ctx.strokeStyle = "#1d3a8a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(80, 940);
  ctx.bezierCurveTo(120, 880, 150, 980, 190, 920);
  ctx.bezierCurveTo(220, 880, 240, 970, 290, 925);
  ctx.stroke();
  ctx.fillStyle = "#222";
  ctx.fillText("Head of People", 80, 985);
  ctx.strokeStyle = "rgba(190, 40, 40, 0.75)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(640, 930, 70, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(190, 40, 40, 0.8)";
  ctx.font = "bold 18px Georgia, serif";
  ctx.fillText("ACME LTD.", 590, 937);
  return ctx.getImageData(0, 0, PAGE.w, PAGE.h);
}

/** A phone-style photo of the letter lying at an angle on a desk, with uneven lighting. */
export function drawSamplePhoto() {
  const W = 1400;
  const H = 1050;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  const desk = ctx.createLinearGradient(0, 0, W, H);
  desk.addColorStop(0, "#6b4a32");
  desk.addColorStop(1, "#3e2a1c");
  ctx.fillStyle = desk;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.08;
  for (let y = 0; y < H; y += 6) {
    ctx.fillStyle = y % 12 ? "#000" : "#fff";
    ctx.fillRect(0, y + Math.sin(y / 40) * 3, W, 2);
  }
  ctx.globalAlpha = 1;

  // A true pinhole-camera projection of the 850×1100 page (tilted back ~23°, f = 1500px),
  // so the scanner's perspective maths can recover its real proportions.
  const quad = [
    { x: 500, y: 191 },
    { x: 1061, y: 219 },
    { x: 1028, y: 994 },
    { x: 344, y: 912 },
  ];

  // Soft shadow under the paper
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetX = 18;
  ctx.shadowOffsetY = 22;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  quad.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Map the letter into the tilted quad with the same perspective maths the scanner uses.
  const photo = ctx.getImageData(0, 0, W, H);
  const pageRect = [
    { x: 0, y: 0 },
    { x: PAGE.w, y: 0 },
    { x: PAGE.w, y: PAGE.h },
    { x: 0, y: PAGE.h },
  ];
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  warp(drawLetter(), photo, homography(quad, pageRect), {
    x0: Math.floor(Math.min(...xs)),
    y0: Math.floor(Math.min(...ys)),
    x1: Math.ceil(Math.max(...xs)),
    y1: Math.ceil(Math.max(...ys)),
  }, false);
  ctx.putImageData(photo, 0, 0);

  // Uneven room lighting: bright top-left, shadowed bottom-right.
  const light = ctx.createRadialGradient(350, 150, 100, 700, 600, 1100);
  light.addColorStop(0, "rgba(255, 245, 225, 0.18)");
  light.addColorStop(1, "rgba(0, 0, 0, 0.38)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);

  return new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
}
