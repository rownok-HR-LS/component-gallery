"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import Room3D from "./Room3D";
import {
  aabb,
  CATALOG,
  COLORS,
  findProblems,
  makeItem,
  openingSpan,
  TEMPLATES,
  uid,
  wallLength,
  type Item,
  type Opening,
  type Plan,
  type Wall,
} from "./plan";
import styles from "./RoomPlanner.module.css";

const STORAGE_KEY = "gallery-room-v1";
const PAD = 70;
const GRID = 5;
const WALL_SNAP = 8;
type Mode = "split" | "2d" | "3d";
type Gesture = { kind: "move"; id: string; dx: number; dy: number; base: Plan; moved: boolean } | { kind: "rotate"; id: string; base: Plan };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number, step: number) => Math.round(v / step) * step;

// Plan colours live here (not in CSS) so the PNG export carries them.
const PALETTE = {
  light: { bg: "#eef1f4", floor: "#efe3d0", grid: "rgba(90,70,40,0.10)", grid2: "rgba(90,70,40,0.2)", wall: "#3a3a40", text: "#1f2430", dim: "#2a78d6", window: "#9fd0f5", warn: "#e5484d", sel: "#2a78d6" },
  dark: { bg: "#141418", floor: "#3a3228", grid: "rgba(255,240,220,0.07)", grid2: "rgba(255,240,220,0.14)", wall: "#d8d6d0", text: "#f4f4f5", dim: "#6da7ec", window: "#5aa9e0", warn: "#f97066", sel: "#6da7ec" },
};

export default function RoomPlanner() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("split");
  const [narrow, setNarrow] = useState(false);
  const [dark, setDark] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const history = useRef<Plan[]>([]);
  const planRef = useRef(plan);
  planRef.current = plan;

  useEffect(() => {
    let saved: Plan | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {}
    setPlan(saved?.room && Array.isArray(saved.items) ? saved : TEMPLATES[0].build());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(media.matches);
    const onTheme = () => setDark(media.matches);
    media.addEventListener("change", onTheme);
    const el = root.current;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 820));
    if (el) {
      setNarrow(el.getBoundingClientRect().width < 820);
      ro.observe(el);
    }
    return () => {
      media.removeEventListener("change", onTheme);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!plan) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    } catch {}
  }, [plan]);

  const view: Mode = narrow && mode === "split" ? "2d" : mode;
  const problems = useMemo(() => (plan ? findProblems(plan) : []), [plan]);
  const flagged = new Set(problems.map((p) => p.id));
  const C = dark ? PALETTE.dark : PALETTE.light;

  function commit(next: Plan, base: Plan | null = planRef.current) {
    if (base) {
      history.current.push(base);
      if (history.current.length > 80) history.current.shift();
      setCanUndo(true);
    }
    setPlan(next);
  }
  function undo() {
    const prev = history.current.pop();
    if (prev) setPlan(prev);
    setCanUndo(history.current.length > 0);
  }
  const editItem = (id: string, patch: Partial<Item>) =>
    plan && commit({ ...plan, items: plan.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const editRoom = (patch: Partial<Plan["room"]>) => plan && commit({ ...plan, room: { ...plan.room, ...patch } });
  const editOpening = (id: string, patch: Partial<Opening>) =>
    plan &&
    commit({
      ...plan,
      openings: plan.openings.map((o) => {
        if (o.id !== id) return o;
        const next = { ...o, ...patch };
        const len = wallLength(next.wall, plan.room);
        next.width = clamp(next.width, 40, len);
        next.offset = clamp(next.offset, 0, len - next.width);
        return next;
      }),
    });

  function addItem(index: number) {
    if (!plan) return;
    const entry = CATALOG[index];
    const crowd = plan.items.filter((i) => Math.hypot(i.x - plan.room.w / 2, i.y - plan.room.d / 2) < 20).length;
    const it = makeItem(entry, round(plan.room.w / 2 + crowd * 20, GRID), round(plan.room.d / 2 + crowd * 20, GRID));
    commit({ ...plan, items: [...plan.items, it] });
    setSelected(it.id);
  }

  function remove(id: string) {
    if (!plan) return;
    commit({ ...plan, items: plan.items.filter((i) => i.id !== id) });
    setSelected(null);
  }

  function duplicate(id: string) {
    if (!plan) return;
    const src = plan.items.find((i) => i.id === id);
    if (!src) return;
    const copy = { ...src, id: uid(), x: src.x + 30, y: src.y + 30 };
    commit({ ...plan, items: [...plan.items, copy] });
    setSelected(copy.id);
  }

  // ── 2D pointer interaction ──────────────────────────────────────────────────────────
  function toPlan(e: { clientX: number; clientY: number }) {
    const s = svg.current!;
    const pt = s.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(s.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }

  function onPointerDown(e: RPointerEvent<SVGSVGElement>) {
    if (!plan) return;
    root.current?.focus({ preventScroll: true });
    const target = e.target as Element;
    const rotateId = target.getAttribute("data-rotate");
    const id = target.closest("[data-item]")?.getAttribute("data-item");
    if (rotateId) {
      gesture.current = { kind: "rotate", id: rotateId, base: plan };
    } else if (id) {
      const it = plan.items.find((i) => i.id === id)!;
      const p = toPlan(e);
      setSelected(id);
      gesture.current = { kind: "move", id, dx: p.x - it.x, dy: p.y - it.y, base: plan, moved: false };
    } else {
      setSelected(null);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: RPointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    const p0 = planRef.current;
    if (!g || !p0) return;
    const p = toPlan(e);
    const it = g.base.items.find((i) => i.id === g.id)!;
    if (g.kind === "move") {
      let x = round(p.x - g.dx, GRID);
      let y = round(p.y - g.dy, GRID);
      if (!g.moved && Math.hypot(x - it.x, y - it.y) < 2) return;
      g.moved = true;
      // Snap flush to a wall when an edge comes close.
      const b = aabb({ ...it, x, y });
      if (Math.abs(b.x0) < WALL_SNAP) x -= b.x0;
      else if (Math.abs(p0.room.w - b.x1) < WALL_SNAP) x += p0.room.w - b.x1;
      if (Math.abs(b.y0) < WALL_SNAP) y -= b.y0;
      else if (Math.abs(p0.room.d - b.y1) < WALL_SNAP) y += p0.room.d - b.y1;
      setPlan({ ...g.base, items: g.base.items.map((i) => (i.id === g.id ? { ...i, x, y } : i)) });
    } else {
      let angle = (Math.atan2(p.y - it.y, p.x - it.x) * 180) / Math.PI + 90;
      angle = e.shiftKey ? Math.round(angle) : round(angle, 15);
      angle = ((angle % 360) + 360) % 360;
      setPlan({ ...g.base, items: g.base.items.map((i) => (i.id === g.id ? { ...i, rot: angle } : i)) });
    }
  }

  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !planRef.current) return;
    if ((g.kind === "move" && g.moved) || g.kind === "rotate") commit(planRef.current, g.base);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("input, select, [data-3d]")) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k === "z") undo();
    else if (!selected || !plan) return;
    else if (k === "delete" || k === "backspace") remove(selected);
    else if (k === "r") {
      const it = plan.items.find((i) => i.id === selected)!;
      editItem(selected, { rot: (it.rot + 90) % 360 });
    } else if (mod && k === "d") duplicate(selected);
    else if (k === "escape") setSelected(null);
    else if (k.startsWith("arrow")) {
      const step = e.shiftKey ? 10 : 1;
      const it = plan.items.find((i) => i.id === selected)!;
      editItem(selected, {
        x: it.x + (k === "arrowleft" ? -step : k === "arrowright" ? step : 0),
        y: it.y + (k === "arrowup" ? -step : k === "arrowdown" ? step : 0),
      });
    } else return;
    e.preventDefault();
  }

  async function exportPng() {
    const s = svg.current;
    if (!s || !plan) return;
    const clone = s.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll("[data-ui]").forEach((n) => n.remove());
    const vb = s.viewBox.baseVal;
    const scale = 3;
    clone.setAttribute("width", String(vb.width * scale));
    clone.setAttribute("height", String(vb.height * scale));
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = vb.width * scale;
      c.height = vb.height * scale;
      c.getContext("2d")!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      c.toBlob((b) => {
        if (!b) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = "room-plan.png";
        a.click();
      });
    };
    img.src = url;
  }

  if (!plan) {
    return (
      <div ref={root} className={styles.card}>
        <div className={styles.loading}>Loading your room…</div>
      </div>
    );
  }

  const { room } = plan;
  const sel = plan.items.find((i) => i.id === selected) ?? null;
  const area = (room.w * room.d) / 10000;
  const footprint = plan.items.filter((i) => i.kind !== "rug").reduce((a, i) => a + (i.w * i.d) / 10000, 0);
  const free = Math.max(0, 1 - footprint / area);
  const fs = Math.max(9, Math.min(14, Math.max(room.w, room.d) / 40));

  const plan2d = (
    <div className={styles.view2d}>
      <svg
        ref={svg}
        viewBox={`${-PAD} ${-PAD} ${room.w + PAD * 2} ${room.d + PAD * 2}`}
        className={styles.svg}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
      >
        <rect x={-PAD} y={-PAD} width={room.w + PAD * 2} height={room.d + PAD * 2} fill={C.bg} />
        <defs>
          <pattern id="rp-grid" width={10} height={10} patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" stroke={C.grid} strokeWidth={0.5} />
          </pattern>
          <pattern id="rp-grid50" width={50} height={50} patternUnits="userSpaceOnUse">
            <rect width={50} height={50} fill="url(#rp-grid)" />
            <path d="M50 0H0V50" fill="none" stroke={C.grid2} strokeWidth={0.8} />
          </pattern>
        </defs>
        <rect x={0} y={0} width={room.w} height={room.d} fill={C.floor} />
        <rect x={0} y={0} width={room.w} height={room.d} fill="url(#rp-grid50)" />

        {/* Room dimensions */}
        <g fill={C.text} fontSize={fs} textAnchor="middle" opacity={0.75}>
          <text x={room.w / 2} y={-28}>{(room.w / 100).toFixed(2)} m</text>
          <text x={-30} y={room.d / 2} transform={`rotate(-90 ${-30} ${room.d / 2})`}>
            {(room.d / 100).toFixed(2)} m
          </text>
        </g>

        {/* Furniture */}
        {plan.items.map((it) => {
          const bad = flagged.has(it.id) && it.kind !== "rug";
          const isSel = it.id === selected;
          const w = it.w;
          const d = it.d;
          return (
            <g key={it.id} data-item={it.id} transform={`translate(${it.x} ${it.y}) rotate(${it.rot})`} style={{ cursor: "move" }}>
              <rect
                x={-w / 2}
                y={-d / 2}
                width={w}
                height={d}
                rx={it.kind === "rug" ? 2 : 4}
                fill={it.color}
                fillOpacity={it.kind === "rug" ? 0.55 : 0.92}
                stroke={bad ? C.warn : isSel ? C.sel : "rgba(0,0,0,0.35)"}
                strokeWidth={bad || isSel ? 3 : 1}
                strokeDasharray={bad ? "6 4" : undefined}
              />
              {it.kind === "bed" && (
                <>
                  <rect x={-w / 2 + 6} y={-d / 2 + 8} width={w - 12} height={d - 14} rx={4} fill="#f3efe8" opacity={0.9} pointerEvents="none" />
                  {(w > 120 ? [-1, 1] : [0]).map((sx) => (
                    <rect key={sx} x={sx * w * 0.24 - Math.min(26, w * 0.2)} y={-d / 2 + 14} width={Math.min(52, w * 0.4)} height={28} rx={6} fill="#ffffff" stroke="rgba(0,0,0,0.15)" pointerEvents="none" />
                  ))}
                  <rect x={-w / 2 + 6} y={d * 0.05} width={w - 12} height={d * 0.42} rx={4} fill="#7e9bb8" opacity={0.85} pointerEvents="none" />
                </>
              )}
              {(it.kind === "sofa" || it.kind === "armchair") && (
                <rect x={-w / 2} y={-d / 2} width={w} height={d * 0.25} rx={4} fill="rgba(0,0,0,0.18)" pointerEvents="none" />
              )}
              {it.kind === "plant" && <circle r={Math.min(w, d) * 0.42} fill="rgba(255,255,255,0.18)" pointerEvents="none" />}
              <text
                y={4}
                // Keep labels readable on pieces turned upside down.
                transform={it.rot > 90 && it.rot < 270 ? "rotate(180)" : undefined}
                textAnchor="middle"
                fontSize={Math.min(fs, Math.max(8, Math.min(w, d) / 5))}
                fill={it.kind === "bed" ? "#1f2430" : "#ffffff"}
                pointerEvents="none"
                style={{ paintOrder: "stroke" }}
                stroke={it.kind === "bed" ? "none" : "rgba(0,0,0,0.35)"}
                strokeWidth={2}
              >
                {it.label}
              </text>
              {isSel && (
                <g data-ui>
                  <line x1={0} y1={-d / 2} x2={0} y2={-d / 2 - 22} stroke={C.sel} strokeWidth={1.5} />
                  <circle data-rotate={it.id} cy={-d / 2 - 26} r={8} fill="#fff" stroke={C.sel} strokeWidth={2} style={{ cursor: "grab" }} />
                </g>
              )}
            </g>
          );
        })}

        {/* Walls with door and window gaps */}
        <rect x={-6} y={-6} width={room.w + 12} height={room.d + 12} fill="none" stroke={C.wall} strokeWidth={12} />
        {plan.openings.map((o) => {
          const { p, q, inward } = openingSpan(o, room);
          const along = { x: q.x - p.x, y: q.y - p.y };
          const nx = -inward.x * 6;
          const ny = -inward.y * 6;
          const gap = (
            <line x1={p.x + nx} y1={p.y + ny} x2={q.x + nx} y2={q.y + ny} stroke={o.type === "door" ? C.floor : C.window} strokeWidth={13} />
          );
          if (o.type === "window") {
            return (
              <g key={o.id}>
                {gap}
                <line x1={p.x + nx} y1={p.y + ny} x2={q.x + nx} y2={q.y + ny} stroke={C.wall} strokeWidth={1.5} />
              </g>
            );
          }
          const hinge = o.hinge === "start" ? p : q;
          const closed = o.hinge === "start" ? q : p;
          const open = { x: hinge.x + inward.x * o.width, y: hinge.y + inward.y * o.width };
          const cross = (closed.x - hinge.x) * (open.y - hinge.y) - (closed.y - hinge.y) * (open.x - hinge.x);
          return (
            <g key={o.id}>
              {gap}
              <path
                d={`M ${closed.x} ${closed.y} A ${o.width} ${o.width} 0 0 ${cross > 0 ? 1 : 0} ${open.x} ${open.y}`}
                fill="none"
                stroke={C.wall}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line x1={hinge.x} y1={hinge.y} x2={open.x} y2={open.y} stroke={C.wall} strokeWidth={3} />
              {Math.hypot(along.x, along.y) > 0 && null}
            </g>
          );
        })}

        {/* Distances from the selected piece to each wall */}
        {sel && sel.kind !== "rug" && (() => {
          const b = aabb(sel);
          const cx = (b.x0 + b.x1) / 2;
          const cy = (b.y0 + b.y1) / 2;
          const lines = [
            { x1: 0, y1: cy, x2: b.x0, y2: cy, v: b.x0 },
            { x1: b.x1, y1: cy, x2: room.w, y2: cy, v: room.w - b.x1 },
            { x1: cx, y1: 0, x2: cx, y2: b.y0, v: b.y0 },
            { x1: cx, y1: b.y1, x2: cx, y2: room.d, v: room.d - b.y1 },
          ].filter((l) => l.v > 1);
          return (
            <g data-ui pointerEvents="none">
              {lines.map((l, i) => (
                <g key={i}>
                  <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={C.dim} strokeWidth={1.2} strokeDasharray="5 4" />
                  <rect x={(l.x1 + l.x2) / 2 - 22} y={(l.y1 + l.y2) / 2 - 9} width={44} height={17} rx={8} fill={C.dim} />
                  <text x={(l.x1 + l.x2) / 2} y={(l.y1 + l.y2) / 2 + 4} textAnchor="middle" fontSize={10.5} fill="#fff" fontWeight={600}>
                    {Math.round(l.v)} cm
                  </text>
                </g>
              ))}
            </g>
          );
        })()}
      </svg>
    </div>
  );

  return (
    <div ref={root} className={styles.card} tabIndex={-1} onKeyDown={onKeyDown}>
      <header className={styles.head}>
        <div>
          <h3 className={styles.title}>Room planner</h3>
          <p className={styles.subtitle}>Draw your room to scale, arrange real-size furniture, then walk through it in 3D.</p>
        </div>
        <div className={styles.headActions}>
          <div className={styles.segmented} role="radiogroup" aria-label="View">
            {(narrow ? (["2d", "3d"] as const) : (["split", "2d", "3d"] as const)).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={view === m} onClick={() => setMode(m)}>
                {m === "split" ? "2D + 3D" : m.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" className={styles.ghost} onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <select
            className={styles.select}
            value=""
            onChange={(e) => {
              const t = TEMPLATES.find((x) => x.key === e.target.value);
              if (t) {
                commit(t.build());
                setSelected(null);
              }
            }}
            aria-label="Start from a template"
          >
            <option value="">Templates…</option>
            {TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <button type="button" className={styles.ghost} onClick={exportPng}>
            Save PNG
          </button>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.library} aria-label="Furniture">
          {[...new Set(CATALOG.map((c) => c.group))].map((group) => (
            <div key={group} className={styles.group}>
              <span className={styles.groupTitle}>{group}</span>
              {CATALOG.map((c, i) =>
                c.group !== group ? null : (
                  <button key={c.label} type="button" className={styles.libItem} onClick={() => addItem(i)} title={`${c.w} × ${c.d} cm`}>
                    <span className={styles.libSwatch} style={{ background: c.color, aspectRatio: `${c.w} / ${c.d}` }} />
                    <span>
                      {c.label}
                      <small>
                        {c.w}×{c.d}
                      </small>
                    </span>
                  </button>
                ),
              )}
            </div>
          ))}
        </aside>

        <div className={styles.stage} data-view={view}>
          {view !== "3d" && plan2d}
          {view !== "2d" && (
            <div data-3d className={styles.stage3d}>
              <Room3D plan={plan} selected={selected} dark={dark} />
            </div>
          )}
        </div>

        <aside className={styles.inspector} aria-label="Properties">
          {sel ? (
            <>
              <div className={styles.inspHead}>
                <span className={styles.inspSwatch} style={{ background: sel.color }} />
                <input className={styles.inspName} value={sel.label} onChange={(e) => editItem(sel.id, { label: e.target.value })} aria-label="Name" />
              </div>
              <div className={styles.grid3}>
                {(["w", "d", "h"] as const).map((k) => (
                  <label key={k}>
                    {k === "w" ? "Width" : k === "d" ? "Depth" : "Height"}
                    <input
                      type="number"
                      min={k === "h" ? 1 : 20}
                      max={600}
                      value={sel[k]}
                      onChange={(e) => editItem(sel.id, { [k]: clamp(Number(e.target.value) || 0, k === "h" ? 1 : 20, 600) })}
                    />
                  </label>
                ))}
              </div>
              <label className={styles.field}>
                Rotation
                <span className={styles.rotRow}>
                  <input type="range" min={0} max={345} step={15} value={sel.rot} onChange={(e) => editItem(sel.id, { rot: Number(e.target.value) })} />
                  <span>{Math.round(sel.rot)}°</span>
                </span>
              </label>
              <div className={styles.swatches}>
                {COLORS.map((c) => (
                  <button key={c} type="button" style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={sel.color === c} onClick={() => editItem(sel.id, { color: c })} />
                ))}
              </div>
              <div className={styles.inspActions}>
                <button type="button" className={styles.ghost} onClick={() => editItem(sel.id, { rot: (sel.rot + 90) % 360 })}>
                  ↻ 90°
                </button>
                <button type="button" className={styles.ghost} onClick={() => duplicate(sel.id)}>
                  Duplicate
                </button>
                <button type="button" className={styles.danger} onClick={() => remove(sel.id)}>
                  Delete
                </button>
              </div>
              <p className={styles.keys}>Drag to move · handle to rotate (Shift = free) · R rotate · arrows nudge · Del</p>
            </>
          ) : (
            <>
              <span className={styles.groupTitle}>Room (cm)</span>
              <div className={styles.grid3}>
                {(["w", "d", "h"] as const).map((k) => (
                  <label key={k}>
                    {k === "w" ? "Width" : k === "d" ? "Length" : "Height"}
                    <input
                      type="number"
                      min={150}
                      max={1500}
                      step={10}
                      value={room[k]}
                      onChange={(e) => editRoom({ [k]: clamp(Number(e.target.value) || 0, 150, 1500) })}
                    />
                  </label>
                ))}
              </div>
              <span className={styles.groupTitle}>Doors & windows</span>
              <ul className={styles.openings}>
                {plan.openings.map((o) => (
                  <li key={o.id}>
                    <div className={styles.openRow}>
                      <strong>{o.type === "door" ? "Door" : "Window"}</strong>
                      <select value={o.wall} onChange={(e) => editOpening(o.id, { wall: e.target.value as Wall })} aria-label="Wall">
                        {(["top", "right", "bottom", "left"] as const).map((w) => (
                          <option key={w} value={w}>
                            {w} wall
                          </option>
                        ))}
                      </select>
                      <button type="button" aria-label="Remove" onClick={() => commit({ ...plan, openings: plan.openings.filter((x) => x.id !== o.id) })}>
                        ×
                      </button>
                    </div>
                    <div className={styles.openRow}>
                      <label>
                        From corner
                        <input type="number" value={o.offset} step={5} onChange={(e) => editOpening(o.id, { offset: Number(e.target.value) || 0 })} />
                      </label>
                      <label>
                        Width
                        <input type="number" value={o.width} step={5} onChange={(e) => editOpening(o.id, { width: Number(e.target.value) || 0 })} />
                      </label>
                      {o.type === "door" && (
                        <button type="button" className={styles.flip} onClick={() => editOpening(o.id, { hinge: o.hinge === "start" ? "end" : "start" })} title="Flip hinge side">
                          ⇋
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className={styles.inspActions}>
                {(["door", "window"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={styles.ghost}
                    onClick={() =>
                      commit({
                        ...plan,
                        openings: [...plan.openings, { id: uid(), type: t, wall: t === "door" ? "bottom" : "top", offset: 40, width: t === "door" ? 85 : 120, hinge: "start" }],
                      })
                    }
                  >
                    + {t === "door" ? "Door" : "Window"}
                  </button>
                ))}
              </div>
              <p className={styles.keys}>Click a piece of furniture to edit it. Add more from the left.</p>
            </>
          )}

          <div className={styles.stats}>
            <div>
              <strong>{area.toFixed(1)} m²</strong>
              <span>floor</span>
            </div>
            <div>
              <strong>{Math.round(free * 100)}%</strong>
              <span>free floor</span>
            </div>
            <div>
              <strong>{plan.items.length}</strong>
              <span>pieces</span>
            </div>
          </div>

          <div className={styles.checks} aria-live="polite">
            {problems.filter((p) => p.message).length === 0 ? (
              <p className={styles.ok}>✓ Everything fits: nothing overlaps or blocks a door.</p>
            ) : (
              problems
                .filter((p) => p.message)
                .map((p, i) => (
                  <button key={i} type="button" className={styles.warn} onClick={() => setSelected(p.id)}>
                    ! {p.message}
                  </button>
                ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
