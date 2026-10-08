"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { applyFilter, type Filter } from "./filters";
import { detectPage, flatten, quadSize, type Quad } from "./geometry";
import { makePdf } from "./pdf";
import { drawSamplePhoto } from "./sample";
import styles from "./DocScanner.module.css";

type Work = { canvas: HTMLCanvasElement; data: ImageData; w: number; h: number; url: string };
type Page = { blob: Blob; url: string; width: number; height: number };
type Shape = "auto" | "a4" | "id";

const MAX_WORK = 2000; // longest side of the working copy
const MAX_OUTPUT = 1600; // longest side of the scan
const LOUPE = 120;
const LOUPE_ZOOM = 3;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "original", label: "Original" },
  { key: "enhanced", label: "Enhanced" },
  { key: "grayscale", label: "Grayscale" },
  { key: "bw", label: "B&W scan" },
];
const SHAPES: { key: Shape; label: string }[] = [
  { key: "auto", label: "Auto" },
  { key: "a4", label: "A4" },
  { key: "id", label: "ID card" },
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function insetQuad(w: number, h: number, f = 0.06): Quad {
  return [
    { x: w * f, y: h * f },
    { x: w * (1 - f), y: h * f },
    { x: w * (1 - f), y: h * (1 - f) },
    { x: w * f, y: h * (1 - f) },
  ];
}

function guessCorners(work: Work): Quad {
  const s = Math.min(1, 240 / Math.max(work.w, work.h));
  const small = document.createElement("canvas");
  small.width = Math.round(work.w * s);
  small.height = Math.round(work.h * s);
  const ctx = small.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(work.canvas, 0, 0, small.width, small.height);
  const quad = detectPage(ctx.getImageData(0, 0, small.width, small.height));
  return quad ? (quad.map((p) => ({ x: p.x / s, y: p.y / s })) as Quad) : insetQuad(work.w, work.h);
}

function outputSize(quad: Quad, shape: Shape, imageW: number, imageH: number) {
  let { w, h } = quadSize(quad, imageW, imageH);
  const landscape = w >= h;
  if (shape === "a4") {
    const r = Math.SQRT2;
    if (landscape) h = w / r;
    else h = w * r;
  }
  if (shape === "id") {
    const r = 85.6 / 53.98;
    if (landscape) h = w / r;
    else h = w * r;
  }
  const s = Math.min(1, MAX_OUTPUT / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), type, quality));

export default function DocScanner() {
  const [work, setWork] = useState<Work | null>(null);
  const [corners, setCorners] = useState<Quad | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("bw");
  const [shape, setShape] = useState<Shape>("auto");
  const [rotation, setRotation] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [resultSize, setResultSize] = useState<{ w: number; h: number } | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const editor = useRef<HTMLDivElement>(null);
  const result = useRef<HTMLCanvasElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);

  async function load(file: Blob) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    // onload rather than img.decode(): decode() can stall in background tabs.
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read that image"));
      img.src = url;
    });
    const s = Math.min(1, MAX_WORK / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * s);
    canvas.height = Math.round(img.naturalHeight * s);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const next: Work = { canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height), w: canvas.width, h: canvas.height, url };
    setWork((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return next;
    });
    setCorners(guessCorners(next));
    setRotation(0);
  }

  // Flatten + filter whenever the inputs settle (not while a corner is being dragged).
  useEffect(() => {
    if (!work || !corners || dragging !== null) return;
    setProcessing(true);
    const timer = setTimeout(() => {
      const { w, h } = outputSize(corners, shape, work.w, work.h);
      const flat = applyFilter(flatten(work.data, corners, w, h), filter);
      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      tmp.getContext("2d")!.putImageData(flat, 0, 0);

      const out = result.current;
      if (!out) return;
      const quarter = rotation % 2 === 1;
      out.width = quarter ? h : w;
      out.height = quarter ? w : h;
      const ctx = out.getContext("2d")!;
      ctx.save();
      ctx.translate(out.width / 2, out.height / 2);
      ctx.rotate((rotation * Math.PI) / 2);
      ctx.drawImage(tmp, -w / 2, -h / 2);
      ctx.restore();
      setResultSize({ w: out.width, h: out.height });
      setProcessing(false);
    }, 30);
    return () => clearTimeout(timer);
  }, [work, corners, dragging, filter, shape, rotation]);

  // Magnifier around the corner being dragged.
  useEffect(() => {
    if (dragging === null || !work || !corners || !loupe.current || !editor.current) return;
    const ctx = loupe.current.getContext("2d")!;
    const scale = editor.current.getBoundingClientRect().width / work.w;
    const r = LOUPE / 2 / (scale * LOUPE_ZOOM);
    const { x, y } = corners[dragging];
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, LOUPE, LOUPE);
    ctx.drawImage(work.canvas, x - r, y - r, r * 2, r * 2, 0, 0, LOUPE, LOUPE);
    ctx.strokeStyle = "rgba(76, 201, 240, 0.95)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(LOUPE / 2, 0);
    ctx.lineTo(LOUPE / 2, LOUPE);
    ctx.moveTo(0, LOUPE / 2);
    ctx.lineTo(LOUPE, LOUPE / 2);
    ctx.stroke();
  }, [dragging, corners, work]);

  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  function pointToImage(e: PointerEvent) {
    const rect = editor.current!.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * work!.w, 0, work!.w),
      y: clamp(((e.clientY - rect.top) / rect.height) * work!.h, 0, work!.h),
    };
  }

  function moveCorner(i: number, p: { x: number; y: number }) {
    setCorners((q) => (q ? (q.map((c, j) => (j === i ? p : c)) as Quad) : q));
  }

  function onHandleKey(i: number, e: KeyboardEvent) {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = steps[e.key];
    if (!step || !work || !corners || !editor.current) return;
    e.preventDefault();
    const px = (work.w / editor.current.getBoundingClientRect().width) * (e.shiftKey ? 10 : 1);
    moveCorner(i, { x: clamp(corners[i].x + step[0] * px, 0, work.w), y: clamp(corners[i].y + step[1] * px, 0, work.h) });
  }

  async function addPage() {
    if (!result.current || processing) return;
    const blob = await toBlob(result.current, "image/jpeg", 0.9);
    setPages((p) => [...p, { blob, url: URL.createObjectURL(blob), width: result.current!.width, height: result.current!.height }]);
  }

  async function exportPdf() {
    if (!result.current) return;
    const source: Page[] = pages.length
      ? pages
      : [{ blob: await toBlob(result.current, "image/jpeg", 0.9), url: "", width: result.current.width, height: result.current.height }];
    const pdf = makePdf(
      await Promise.all(source.map(async (p) => ({ jpeg: new Uint8Array(await p.blob.arrayBuffer()), width: p.width, height: p.height }))),
    );
    download(pdf, `scan-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function exportPng() {
    if (result.current) download(await toBlob(result.current, "image/png"), "scan.png");
  }

  const quadPath = corners?.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ") + " Z";
  const active = dragging !== null && corners ? corners[dragging] : null;

  return (
    <div className={styles.card}>
      <header className={styles.head}>
        <h3 className={styles.title}>Document scanner</h3>
        <p className={styles.subtitle}>Turn a phone photo of a page into a flat, clean scan. Nothing leaves your device.</p>
      </header>

      {!work || !corners ? (
        <label
          className={styles.dropzone}
          data-over={dragOver}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file?.type.startsWith("image/")) load(file);
          }}
        >
          <input type="file" accept="image/*" className={styles.fileInput} onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" className={styles.dropIcon}>
            <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />
          </svg>
          <span className={styles.dropTitle}>Drop a photo of a document, or click to choose</span>
          <span className={styles.dropNote}>Letters, receipts, certificates, ID cards</span>
          <button
            type="button"
            className={styles.sampleLink}
            onClick={async (e) => {
              e.preventDefault();
              load(await drawSamplePhoto());
            }}
          >
            Try a sample photo
          </button>
        </label>
      ) : (
        <div className={styles.body}>
          <section className={styles.panel} aria-label="Adjust corners">
            <div className={styles.panelHead}>
              <span className={styles.step}>1</span>
              <span>Adjust the corners</span>
            </div>
            <div
              ref={editor}
              className={styles.editor}
              style={{ aspectRatio: `${work.w} / ${work.h}`, maxWidth: `calc(420px * ${work.w / work.h})` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={work.url} alt="Original photo" className={styles.photo} draggable={false} />
              <svg className={styles.overlay} viewBox={`0 0 ${work.w} ${work.h}`} preserveAspectRatio="none" aria-hidden="true">
                <path d={`M0,0 H${work.w} V${work.h} H0 Z ${quadPath}`} fillRule="evenodd" className={styles.shade} />
                <path d={quadPath} className={styles.outline} />
              </svg>
              {corners.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  className={styles.handle}
                  data-active={dragging === i}
                  style={{ left: `${(p.x / work.w) * 100}%`, top: `${(p.y / work.h) * 100}%` }}
                  aria-label={`${["Top-left", "Top-right", "Bottom-right", "Bottom-left"][i]} corner. Use arrow keys to move.`}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDragging(i);
                  }}
                  onPointerMove={(e) => dragging === i && moveCorner(i, pointToImage(e))}
                  onPointerUp={() => setDragging(null)}
                  onPointerCancel={() => setDragging(null)}
                  onKeyDown={(e) => onHandleKey(i, e)}
                />
              ))}
              {active && (
                <canvas
                  ref={loupe}
                  width={LOUPE}
                  height={LOUPE}
                  className={styles.loupe}
                  data-below={active.y / work.h < 0.3}
                  style={{ left: `${(active.x / work.w) * 100}%`, top: `${(active.y / work.h) * 100}%` }}
                />
              )}
            </div>
            <div className={styles.row}>
              <button type="button" className={styles.chip} onClick={() => setCorners(guessCorners(work))}>
                Auto-detect
              </button>
              <button type="button" className={styles.chip} onClick={() => setCorners(insetQuad(work.w, work.h, 0))}>
                Whole photo
              </button>
              <button
                type="button"
                className={styles.chip}
                onClick={() => {
                  setWork(null);
                  setCorners(null);
                }}
              >
                New photo
              </button>
            </div>
          </section>

          <section className={styles.panel} aria-label="Scan result">
            <div className={styles.panelHead}>
              <span className={styles.step}>2</span>
              <span>Your scan</span>
              {resultSize && (
                <span className={styles.meta}>
                  {processing ? "Processing…" : `${resultSize.w} × ${resultSize.h} px`}
                </span>
              )}
            </div>
            <div className={styles.resultBox} data-busy={processing}>
              <canvas ref={result} className={styles.result} role="img" aria-label="Flattened scan" />
            </div>

            <div className={styles.segmented} role="radiogroup" aria-label="Filter">
              {FILTERS.map((f) => (
                <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} onClick={() => setFilter(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className={styles.row}>
              <div className={styles.segmented} role="radiogroup" aria-label="Page shape">
                {SHAPES.map((s) => (
                  <button key={s.key} type="button" role="radio" aria-checked={shape === s.key} onClick={() => setShape(s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <button type="button" className={styles.chip} onClick={() => setRotation((r) => (r + 1) % 4)} aria-label="Rotate 90 degrees">
                ↻ Rotate
              </button>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={addPage} disabled={processing}>
                + Add page{pages.length ? ` (${pages.length})` : ""}
              </button>
              <button type="button" className={styles.secondary} onClick={exportPng} disabled={processing}>
                PNG
              </button>
              <button type="button" className={styles.primary} onClick={exportPdf} disabled={processing}>
                Download PDF{pages.length > 1 ? ` · ${pages.length} pages` : ""}
              </button>
            </div>

            {pages.length > 0 && (
              <ol className={styles.pages} aria-label="Pages in the PDF">
                {pages.map((p, i) => (
                  <li key={p.url}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`Page ${i + 1}`} />
                    <span>{i + 1}</span>
                    <button
                      type="button"
                      aria-label={`Remove page ${i + 1}`}
                      onClick={() => {
                        URL.revokeObjectURL(p.url);
                        setPages((all) => all.filter((x) => x !== p));
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
