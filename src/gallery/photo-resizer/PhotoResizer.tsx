"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import { compressToLimit, drawSamplePortrait } from "./image";
import styles from "./PhotoResizer.module.css";

type Size = { w: number; h: number; kb: number | null; guide: boolean };
type Preset = Size & { key: string; label: string };
type Photo = { img: HTMLImageElement; url: string };
type Result = { url: string; bytes: number; quality: number; fits: boolean };

const PRESETS: Preset[] = [
  { key: "job", label: "Job / admission", w: 300, h: 300, kb: 100, guide: true },
  { key: "signature", label: "Signature", w: 300, h: 80, kb: 60, guide: false },
  { key: "passport", label: "Passport size", w: 413, h: 531, kb: null, guide: true },
  { key: "visa", label: "US visa", w: 600, h: 600, kb: 240, guide: true },
];

// Largest the crop frame is drawn on screen.
const FRAME = { w: 260, h: 280 };
const MAX_ZOOM = 4;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

export default function PhotoResizer() {
  const [presetKey, setPresetKey] = useState("job");
  const [custom, setCustom] = useState({ w: "400", h: "400", kb: "150" });
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const preset = PRESETS.find((p) => p.key === presetKey);
  const size: Size = preset ?? {
    w: clamp(Math.round(Number(custom.w) || 0), 50, 3000),
    h: clamp(Math.round(Number(custom.h) || 0), 50, 3000),
    kb: Number(custom.kb) > 0 ? Number(custom.kb) : null,
    guide: false,
  };

  // On-screen crop frame with the target aspect ratio.
  const frameScale = Math.min(FRAME.w / size.w, FRAME.h / size.h);
  const frameW = size.w * frameScale;
  const frameH = size.h * frameScale;

  const nw = photo?.img.naturalWidth ?? 1;
  const nh = photo?.img.naturalHeight ?? 1;
  const scale = Math.max(frameW / nw, frameH / nh) * zoom; // screen px per image px
  const dispW = nw * scale;
  const dispH = nh * scale;
  // Keep the photo covering the frame however it is dragged or zoomed.
  const pos = {
    x: clamp(offset.x, -(dispW - frameW) / 2, (dispW - frameW) / 2),
    y: clamp(offset.y, -(dispH - frameH) / 2, (dispH - frameH) / 2),
  };

  function load(file: Blob) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPhoto((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { img, url };
      });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = url;
  }

  function choosePreset(key: string) {
    setPresetKey(key);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  // Re-render the output whenever the crop or target changes.
  useEffect(() => {
    if (!photo) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = size.w;
      canvas.height = size.h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size.w, size.h);
      ctx.imageSmoothingQuality = "high";
      const srcW = frameW / scale;
      const srcH = frameH / scale;
      const cx = nw / 2 - pos.x / scale;
      const cy = nh / 2 - pos.y / scale;
      ctx.drawImage(photo.img, cx - srcW / 2, cy - srcH / 2, srcW, srcH, 0, 0, size.w, size.h);

      const { blob, quality } = await compressToLimit(canvas, size.kb);
      if (cancelled) return;
      setResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), bytes: blob.size, quality, fits: size.kb === null || blob.size <= size.kb * 1024 };
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [photo, size.w, size.h, size.kb, frameW, frameH, scale, nw, nh, pos.x, pos.y]);

  // Wheel zoom needs a non-passive listener so the page doesn't scroll.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 1, MAX_ZOOM));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [photo]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (d) setOffset({ x: d.ox + e.clientX - d.px, y: d.oy + e.clientY - d.py });
  }
  function onKeyDown(e: KeyboardEvent) {
    const step = e.shiftKey ? 30 : 8;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) setOffset({ x: pos.x + moves[e.key][0], y: pos.y + moves[e.key][1] });
    else if (e.key === "+" || e.key === "=") setZoom((z) => clamp(z * 1.1, 1, MAX_ZOOM));
    else if (e.key === "-") setZoom((z) => clamp(z / 1.1, 1, MAX_ZOOM));
    else return;
    e.preventDefault();
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) load(file);
  }

  async function loadSample() {
    load(await drawSamplePortrait());
  }

  return (
    <div className={styles.card}>
      <header className={styles.head}>
        <h3 className={styles.title}>Photo resizer for forms</h3>
        <p className={styles.subtitle}>Crop, resize and compress to the exact size a form asks for.</p>
      </header>

      <div className={styles.presets} role="radiogroup" aria-label="Required size">
        {[...PRESETS, null].map((p) => {
          const key = p?.key ?? "custom";
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={presetKey === key}
              className={styles.preset}
              onClick={() => choosePreset(key)}
            >
              <span className={styles.presetName}>{p ? p.label : "Custom"}</span>
              <span className={styles.presetDetail}>
                {p ? `${p.w}×${p.h}${p.kb ? ` · ≤${p.kb} KB` : ""}` : "Your size"}
              </span>
            </button>
          );
        })}
      </div>

      {!preset && (
        <div className={styles.custom}>
          {(["w", "h", "kb"] as const).map((k) => (
            <label key={k} className={styles.customField}>
              <span>{k === "w" ? "Width (px)" : k === "h" ? "Height (px)" : "Max KB"}</span>
              <input
                inputMode="numeric"
                value={custom[k]}
                placeholder={k === "kb" ? "No limit" : ""}
                onChange={(e) => /^\d*$/.test(e.target.value) && setCustom((c) => ({ ...c, [k]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      )}
      <p className={styles.disclaimer}>Common sizes. Always check your form&apos;s own instructions.</p>

      {!photo ? (
        <label
          className={styles.dropzone}
          data-over={dragOver}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept="image/*"
            className={styles.fileInput}
            onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
          />
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" className={styles.dropIcon}>
            <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          <span className={styles.dropTitle}>Drop a photo here, or click to choose</span>
          <span className={styles.dropNote}>JPG or PNG. It never leaves this device.</span>
          <button
            type="button"
            className={styles.sampleLink}
            onClick={(e) => {
              e.preventDefault();
              loadSample();
            }}
          >
            Try a sample photo
          </button>
        </label>
      ) : (
        <div className={styles.body}>
          <div className={styles.editor}>
            <div
              ref={frameRef}
              className={styles.frame}
              style={{ width: frameW, height: frameH }}
              tabIndex={0}
              role="application"
              aria-label="Crop area. Drag or use arrow keys to move, plus and minus to zoom."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={onKeyDown}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt=""
                draggable={false}
                className={styles.photo}
                style={{ width: dispW, height: dispH, transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)` }}
              />
              <div className={styles.thirds} aria-hidden="true" />
              {size.guide && <div className={styles.faceGuide} aria-hidden="true" />}
            </div>
            <label className={styles.zoom}>
              <span>Zoom</span>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            <p className={styles.hint}>Drag to move · scroll to zoom</p>
          </div>

          <div className={styles.output}>
            <span className={styles.outputLabel}>Result</span>
            <div className={styles.preview} style={{ aspectRatio: `${size.w} / ${size.h}` }}>
              {result && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.url} alt={`Resized photo, ${size.w} by ${size.h} pixels`} />
              )}
            </div>
            <dl className={styles.facts}>
              <div>
                <dt>Size</dt>
                <dd>
                  {size.w} × {size.h} px
                </dd>
              </div>
              <div>
                <dt>File</dt>
                <dd>
                  {result ? kb(result.bytes) : "…"}
                  {size.kb && <span className={styles.limit}> of {size.kb} KB max</span>}
                </dd>
              </div>
              <div>
                <dt>Quality</dt>
                <dd>{result ? `${Math.round(result.quality * 100)}%` : "…"}</dd>
              </div>
            </dl>
            {result && (
              <p className={styles.status} data-ok={result.fits}>
                <span aria-hidden="true">{result.fits ? "✓" : "!"}</span>
                {result.fits ? "Ready for upload" : `Still over ${size.kb} KB. Try a smaller size or a plainer background.`}
              </p>
            )}
            <a
              className={styles.download}
              href={result?.url}
              download={`photo-${size.w}x${size.h}.jpg`}
              aria-disabled={!result}
            >
              Download JPG
            </a>
            <button
              type="button"
              className={styles.replace}
              onClick={() => {
                setPhoto(null);
                setResult(null);
              }}
            >
              Use a different photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
