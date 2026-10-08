"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { exportPng } from "./exportPng";
import {
  bounds,
  center,
  connectorPoints,
  contains,
  intersects,
  move,
  pathBox,
  resize,
  smoothPath,
  snap,
  union,
  type Pt,
} from "./geometry";
import {
  fitFont,
  INK,
  isBox,
  SHAPE_COLORS,
  STICKY_COLORS,
  TEMPLATES,
  uid,
  type Box,
  type BoxEl,
  type Connector,
  type El,
  type End,
  type ShapeKind,
  type Tool,
} from "./model";
import { connect, makeIdentity, type Peer } from "./sync";
import styles from "./Whiteboard.module.css";

const STORAGE_KEY = "gallery-whiteboard-v1";
const CHANNEL = "gallery-whiteboard-v1";
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const GRID = 24;
const HISTORY_LIMIT = 100;

type View = { x: number; y: number; zoom: number };
type Gesture =
  | { kind: "pan"; sx: number; sy: number; view: View }
  | { kind: "pinch"; dist: number; mid: Pt; view: View }
  | { kind: "move"; start: Pt; base: El[]; ids: Set<string>; moved: boolean }
  | { kind: "marquee"; start: Pt; base: Set<string> }
  | { kind: "resize"; id: string; corner: number; base: El[]; origin: Box }
  | { kind: "create"; start: Pt; id: string; base: El[]; shape: ShapeKind | "frame" }
  | { kind: "pen"; id: string; points: number[]; base: El[] }
  | { kind: "connect"; id: string; from: End; base: El[] };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const normBox = (a: Pt, b: Pt): Box => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

const TOOLS: { key: Tool; label: string; shortcut: string; icon: ReactNode }[] = [
  { key: "select", label: "Select", shortcut: "V", icon: <path d="M5 3l14 8-6 1.5L10 19z" /> },
  { key: "hand", label: "Hand (hold Space)", shortcut: "H", icon: <path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10m0-4.5a1.5 1.5 0 0 1 3 0V10m0-3a1.5 1.5 0 0 1 3 0v6.5a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L3.8 14a1.5 1.5 0 0 1 2.5-1.7L8 14" /> },
  { key: "sticky", label: "Sticky note", shortcut: "N", icon: <path d="M5 4h14v10l-5 6H5zM14 20v-6h5" /> },
  { key: "text", label: "Text", shortcut: "T", icon: <path d="M5 6V4h14v2M12 4v16M9 20h6" /> },
  { key: "rect", label: "Rectangle", shortcut: "R", icon: <rect x="4" y="6" width="16" height="12" rx="2" /> },
  { key: "ellipse", label: "Ellipse", shortcut: "O", icon: <ellipse cx="12" cy="12" rx="8" ry="6" /> },
  { key: "diamond", label: "Diamond", shortcut: "D", icon: <path d="M12 3l9 9-9 9-9-9z" /> },
  { key: "connector", label: "Connector arrow", shortcut: "L", icon: <path d="M5 19L19 5m0 0h-7m7 0v7" /> },
  { key: "pen", label: "Pen", shortcut: "P", icon: <path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" /> },
  { key: "frame", label: "Frame", shortcut: "F", icon: <path d="M7 3v18M17 3v18M3 7h18M3 17h18" /> },
];
const TOOL_KEYS: Record<string, Tool> = { v: "select", h: "hand", n: "sticky", t: "text", r: "rect", o: "ellipse", d: "diamond", l: "connector", p: "pen", f: "frame" };

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className={styles.icon}>
      {children}
    </svg>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Whiteboard() {
  const [elements, setElements] = useState<El[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [tool, setTool] = useState<Tool>("select");
  const [editing, setEditing] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }[]>([]);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [gestureKind, setGestureKind] = useState<Gesture["kind"] | null>(null);
  const [active, setActive] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [menu, setMenu] = useState<"templates" | "export" | null>(null);
  const [me, setMe] = useState<ReturnType<typeof makeIdentity> | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [size, setSize] = useState({ w: 900, h: 620 });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [dark, setDark] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const elementsRef = useRef<El[]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const history = useRef<{ past: El[][]; future: El[][] }>({ past: [], future: [] });
  const editBase = useRef<El[] | null>(null);
  const link = useRef<ReturnType<typeof connect> | null>(null);
  const timers = useRef<{ send?: ReturnType<typeof setTimeout>; save?: ReturnType<typeof setTimeout>; lastSend: number; lastCursor: number }>({
    lastSend: 0,
    lastCursor: 0,
  });

  const byId = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);

  // ── State plumbing: apply, persist, broadcast, history ─────────────────────────────
  const apply = useCallback((next: El[], opts: { broadcast?: boolean; save?: boolean } = {}) => {
    elementsRef.current = next;
    setElements(next);
    const t = timers.current;
    if (opts.save !== false) {
      clearTimeout(t.save);
      t.save = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(elementsRef.current));
        } catch {}
      }, 300);
    }
    if (opts.broadcast !== false) {
      // Throttled so drags stream to other tabs at ~25 fps.
      const send = () => {
        t.lastSend = Date.now();
        link.current?.sendState(elementsRef.current);
      };
      clearTimeout(t.send);
      if (Date.now() - t.lastSend > 40) send();
      else t.send = setTimeout(send, 40);
    }
  }, []);

  const syncHistoryFlags = () => {
    setCanUndo(history.current.past.length > 0);
    setCanRedo(history.current.future.length > 0);
  };

  const commit = useCallback(
    (next: El[], base: El[] = elementsRef.current) => {
      const h = history.current;
      h.past.push(base);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
      h.future = [];
      syncHistoryFlags();
      apply(next);
    },
    [apply],
  );

  function undo() {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(elementsRef.current);
    syncHistoryFlags();
    setSelected(new Set());
    apply(prev);
  }
  function redo() {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(elementsRef.current);
    syncHistoryFlags();
    setSelected(new Set());
    apply(next);
  }

  // ── Viewport helpers ────────────────────────────────────────────────────────────────
  const toWorld = useCallback((clientX: number, clientY: number): Pt => {
    const r = svg.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
  }, []);

  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    setView((v) => {
      const zoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      return { zoom, x: sx - ((sx - v.x) * zoom) / v.zoom, y: sy - ((sy - v.y) * zoom) / v.zoom };
    });
  }, []);

  const fit = useCallback((els: El[] = elementsRef.current) => {
    const r = svg.current?.getBoundingClientRect();
    const w = r?.width ?? 900;
    const h = r?.height ?? 620;
    const map = new Map(els.map((e) => [e.id, e]));
    const box = union(els.map((e) => bounds(e, map)));
    if (!box) {
      setView({ x: w / 2, y: h / 2, zoom: 1 });
      return;
    }
    const zoom = clamp(Math.min((w - 120) / Math.max(box.w, 1), (h - 120) / Math.max(box.h, 1)), MIN_ZOOM, 1.2);
    setView({ zoom, x: w / 2 - (box.x + box.w / 2) * zoom, y: h / 2 - (box.y + box.h / 2) * zoom });
  }, []);

  // ── Mount: restore, connect to other tabs, track size and theme ────────────────────
  useEffect(() => {
    let saved: El[] | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {}
    const initial = Array.isArray(saved) ? saved : TEMPLATES[0].build();
    apply(initial, { broadcast: false });
    requestAnimationFrame(() => fit(initial));

    const identity = makeIdentity();
    setMe(identity);
    link.current = connect(CHANNEL, identity, {
      onState: (els) => apply(els, { broadcast: false }),
      onPeers: setPeers,
      getState: () => elementsRef.current,
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(media.matches);
    const onTheme = () => setDark(media.matches);
    media.addEventListener("change", onTheme);

    const observer = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    if (svg.current) observer.observe(svg.current);

    // Clicking anywhere outside the board deactivates wheel capture.
    const onDocDown = (e: globalThis.PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setActive(false);
        setMenu(null);
      }
    };
    document.addEventListener("pointerdown", onDocDown, true);

    return () => {
      link.current?.close();
      media.removeEventListener("change", onTheme);
      observer.disconnect();
      document.removeEventListener("pointerdown", onDocDown, true);
    };
  }, [apply, fit]);

  // Put the caret in the inline editor as soon as it opens.
  useEffect(() => {
    if (!editing) return;
    const raf = requestAnimationFrame(() => {
      const field = root.current?.querySelector<HTMLTextAreaElement | HTMLInputElement>("[data-editor]");
      if (field && document.activeElement !== field) {
        field.focus({ preventScroll: true });
        field.setSelectionRange(field.value.length, field.value.length);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [editing]);

  // Wheel: pan, or zoom with Ctrl/⌘ (also trackpad pinch). Only while the board is active.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!active) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top);
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [active, zoomAt]);

  // ── Element helpers ─────────────────────────────────────────────────────────────────
  const hitId = (target: EventTarget | null) => (target as Element | null)?.closest?.("[data-id]")?.getAttribute("data-id") ?? null;

  function elementAt(clientX: number, clientY: number, exclude?: string) {
    for (const node of document.elementsFromPoint(clientX, clientY)) {
      const id = hitId(node);
      if (id && id !== exclude) {
        const el = elementsRef.current.find((e) => e.id === id);
        if (el && isBox(el) && el.type !== "path") return el;
      }
    }
    return null;
  }

  /** Selected ids plus everything sitting inside any selected frame. */
  function movingIds(ids: Set<string>) {
    const out = new Set(ids);
    for (const el of elementsRef.current) {
      if (el.type !== "frame" || !ids.has(el.id)) continue;
      for (const other of elementsRef.current) {
        if (other.id !== el.id && isBox(other) && other.type !== "frame" && contains(el, center(other))) out.add(other.id);
      }
    }
    return out;
  }

  function removeIds(ids: Set<string>) {
    const next = elementsRef.current.filter(
      (e) => !ids.has(e.id) && !(e.type === "connector" && ((e.from.id && ids.has(e.from.id)) || (e.to.id && ids.has(e.to.id)))),
    );
    commit(next);
    setSelected(new Set());
    // The context toolbar disappears with the selection; keep shortcuts working.
    root.current?.focus({ preventScroll: true });
  }

  /** Mouse clicks on toolbars shouldn't pull focus away from the board (keyboard Tab still works). */
  const keepBoardFocus = (e: PointerEvent<HTMLElement>) => {
    if (!(e.target as HTMLElement).closest("input, label")) e.preventDefault();
  };

  function duplicate(ids: Set<string>) {
    const remap = new Map<string, string>();
    const copies: El[] = [];
    for (const el of elementsRef.current) {
      if (!ids.has(el.id) || el.type === "connector") continue;
      const id = uid();
      remap.set(el.id, id);
      copies.push({ ...move(el, 24, 24), id } as El);
    }
    for (const el of elementsRef.current) {
      if (el.type !== "connector") continue;
      const fromOk = el.from.id ? remap.has(el.from.id) : ids.has(el.id);
      const toOk = el.to.id ? remap.has(el.to.id) : ids.has(el.id);
      if (!fromOk || !toOk || (!ids.has(el.id) && !(el.from.id && el.to.id))) continue;
      const shift = (e: End): End => (e.id ? { ...e, id: remap.get(e.id) } : { x: e.x + 24, y: e.y + 24 });
      copies.push({ ...el, id: uid(), from: shift(el.from), to: shift(el.to) });
    }
    commit([...elementsRef.current, ...copies]);
    setSelected(new Set(copies.map((c) => c.id)));
  }

  function reorder(ids: Set<string>, front: boolean) {
    const picked = elementsRef.current.filter((e) => ids.has(e.id));
    const rest = elementsRef.current.filter((e) => !ids.has(e.id));
    commit(front ? [...rest, ...picked] : [...picked, ...rest]);
  }

  function recolor(ids: Set<string>, color: string) {
    commit(elementsRef.current.map((e) => (ids.has(e.id) && (e.type === "sticky" || e.type === "shape") ? { ...e, color } : e)));
  }

  function startEditing(id: string) {
    editBase.current = elementsRef.current;
    setEditing(id);
    setSelected(new Set([id]));
  }

  function finishEditing() {
    if (!editing) return;
    const base = editBase.current;
    const el = elementsRef.current.find((e) => e.id === editing);
    setEditing(null);
    editBase.current = null;
    if (!base) return;
    // An emptied free-text element disappears.
    if (el?.type === "text" && !el.text.trim()) {
      commit(elementsRef.current.filter((e) => e.id !== el.id), base);
      return;
    }
    if (JSON.stringify(base) !== JSON.stringify(elementsRef.current)) commit(elementsRef.current, base);
  }

  function editText(value: string, height?: number) {
    apply(
      elementsRef.current.map((e) => {
        if (e.id !== editing) return e;
        if (e.type === "frame") return { ...e, title: value };
        if (e.type === "text") return { ...e, text: value, h: height ? Math.max(36, height) : e.h };
        if (e.type === "sticky" || e.type === "shape") return { ...e, text: value };
        return e;
      }),
    );
  }

  // ── Pointer handling ────────────────────────────────────────────────────────────────
  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    // Stops the browser's mousedown focus change, which would otherwise steal focus from a
    // text editor opened by this same click (clicks and double-clicks still fire).
    e.preventDefault();
    setActive(true);
    setMenu(null);
    root.current?.focus({ preventScroll: true });
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: viewRef.current };
      setGestureKind("pinch");
      return;
    }
    if (editing) finishEditing();

    const p = toWorld(e.clientX, e.clientY);
    const id = hitId(e.target);
    const handle = (e.target as Element).getAttribute("data-handle");
    const els = elementsRef.current;

    if (e.button === 1 || tool === "hand" || spaceDown) {
      gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, view: viewRef.current };
    } else if (tool === "select") {
      if (handle !== null && selectedRef.current.size === 1) {
        const target = els.find((x) => x.id === [...selectedRef.current][0]);
        if (target && isBox(target)) gesture.current = { kind: "resize", id: target.id, corner: Number(handle), base: els, origin: { x: target.x, y: target.y, w: target.w, h: target.h } };
      } else if (id) {
        let next = selectedRef.current;
        if (e.shiftKey) {
          next = new Set(next);
          if (next.has(id)) next.delete(id);
          else next.add(id);
        } else if (!next.has(id)) next = new Set([id]);
        setSelected(next);
        gesture.current = { kind: "move", start: p, base: els, ids: movingIds(next), moved: false };
      } else {
        if (!e.shiftKey) setSelected(new Set());
        gesture.current = { kind: "marquee", start: p, base: e.shiftKey ? new Set(selectedRef.current) : new Set() };
      }
    } else if (tool === "sticky" || tool === "text") {
      const el: El =
        tool === "sticky"
          ? { id: uid(), type: "sticky", x: p.x - 85, y: p.y - 75, w: 170, h: 150, text: "", color: STICKY_COLORS[0] }
          : { id: uid(), type: "text", x: p.x, y: p.y - 18, w: 260, h: 36, text: "" };
      apply([...els, el]);
      history.current.past.push(els);
      syncHistoryFlags();
      setTool("select");
      editBase.current = elementsRef.current;
      setEditing(el.id);
      setSelected(new Set([el.id]));
    } else if (tool === "rect" || tool === "ellipse" || tool === "diamond" || tool === "frame") {
      const newId = uid();
      const el: El =
        tool === "frame"
          ? { id: newId, type: "frame", x: p.x, y: p.y, w: 1, h: 1, title: "Frame" }
          : { id: newId, type: "shape", kind: tool, x: p.x, y: p.y, w: 1, h: 1, text: "", color: SHAPE_COLORS[0] };
      gesture.current = { kind: "create", start: p, id: newId, base: els, shape: tool };
      apply(tool === "frame" ? [el, ...els] : [...els, el]);
    } else if (tool === "pen") {
      const newId = uid();
      gesture.current = { kind: "pen", id: newId, points: [p.x, p.y], base: els };
      apply([...els, { id: newId, type: "path", points: [p.x, p.y], x: p.x, y: p.y, w: 1, h: 1, color: dark ? "#e8e6f0" : INK }]);
    } else if (tool === "connector") {
      const target = elementAt(e.clientX, e.clientY);
      const from: End = target ? { id: target.id, x: p.x, y: p.y } : { x: p.x, y: p.y };
      const newId = uid();
      gesture.current = { kind: "connect", id: newId, from, base: els };
      apply([...els, { id: newId, type: "connector", from, to: { x: p.x, y: p.y }, color: dark ? "#b0a8f5" : "#5b4fc7" }]);
    }
    setGestureKind(gesture.current?.kind ?? null);
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const p = toWorld(e.clientX, e.clientY);
    const t = timers.current;
    if (Date.now() - t.lastCursor > 30) {
      t.lastCursor = Date.now();
      link.current?.sendCursor(p.x, p.y);
    }
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const r = svg.current!.getBoundingClientRect();
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoom = clamp((g.view.zoom * dist) / g.dist, MIN_ZOOM, MAX_ZOOM);
      const sx = g.mid.x - r.left;
      const sy = g.mid.y - r.top;
      setView({
        zoom,
        x: sx - ((sx - g.view.x) * zoom) / g.view.zoom + (mid.x - g.mid.x),
        y: sy - ((sy - g.view.y) * zoom) / g.view.zoom + (mid.y - g.mid.y),
      });
    } else if (g.kind === "pan") {
      setView({ ...g.view, x: g.view.x + e.clientX - g.sx, y: g.view.y + e.clientY - g.sy });
    } else if (g.kind === "move") {
      let dx = p.x - g.start.x;
      let dy = p.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) * viewRef.current.zoom < 3) return;
      g.moved = true;
      const map = new Map(g.base.map((el) => [el.id, el]));
      const movingBox = union(g.base.filter((el) => g.ids.has(el.id)).map((el) => bounds(el, map)));
      if (movingBox && !e.altKey) {
        const others = g.base.filter((el) => !g.ids.has(el.id) && isBox(el) && el.type !== "path") as BoxEl[];
        const s = snap({ ...movingBox, x: movingBox.x + dx, y: movingBox.y + dy }, others, 6 / viewRef.current.zoom);
        dx += s.dx;
        dy += s.dy;
        setGuides(s.guides);
      }
      apply(g.base.map((el) => (g.ids.has(el.id) ? move(el, dx, dy) : el)));
    } else if (g.kind === "marquee") {
      const box = normBox(g.start, p);
      setMarquee(box);
      const map = new Map(elementsRef.current.map((el) => [el.id, el]));
      const hit = elementsRef.current.filter((el) => intersects(box, bounds(el, map)) && !(el.type === "frame" && !(box.x <= el.x && box.y <= el.y && box.x + box.w >= el.x + el.w && box.y + box.h >= el.y + el.h)));
      setSelected(new Set([...g.base, ...hit.map((el) => el.id)]));
    } else if (g.kind === "resize") {
      const o = g.origin;
      const left = g.corner === 0 || g.corner === 3;
      const top = g.corner === 0 || g.corner === 1;
      const x0 = left ? Math.min(p.x, o.x + o.w - 24) : o.x;
      const y0 = top ? Math.min(p.y, o.y + o.h - 24) : o.y;
      const x1 = left ? o.x + o.w : Math.max(p.x, o.x + 24);
      const y1 = top ? o.y + o.h : Math.max(p.y, o.y + 24);
      apply(g.base.map((el) => (el.id === g.id && isBox(el) ? resize(el, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }) : el)));
    } else if (g.kind === "create") {
      let box = normBox(g.start, p);
      if (e.shiftKey) box = { ...box, w: Math.max(box.w, box.h), h: Math.max(box.w, box.h) };
      apply(elementsRef.current.map((el) => (el.id === g.id ? ({ ...el, ...box } as El) : el)));
    } else if (g.kind === "pen") {
      const last = g.points.length - 2;
      if (Math.hypot(p.x - g.points[last], p.y - g.points[last + 1]) * viewRef.current.zoom < 2) return;
      g.points.push(p.x, p.y);
      const pts = [...g.points];
      apply(elementsRef.current.map((el) => (el.id === g.id ? { ...el, points: pts, ...pathBox(pts) } : el)));
    } else if (g.kind === "connect") {
      const target = elementAt(e.clientX, e.clientY, g.id);
      const validTarget = target && target.id !== g.from.id ? target : null;
      setHoverTarget(validTarget?.id ?? null);
      const to: End = validTarget ? { id: validTarget.id, x: p.x, y: p.y } : { x: p.x, y: p.y };
      apply(elementsRef.current.map((el) => (el.id === g.id && el.type === "connector" ? { ...el, to } : el)));
    }
  }

  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    gesture.current = null;
    setGestureKind(null);
    setGuides([]);
    setMarquee(null);
    setHoverTarget(null);
    if (!g) return;

    if (g.kind === "move" && g.moved) commit(elementsRef.current, g.base);
    if (g.kind === "resize") commit(elementsRef.current, g.base);
    if (g.kind === "pen") {
      if (g.points.length >= 4) commit(elementsRef.current, g.base);
      else apply(g.base);
    }
    if (g.kind === "create") {
      const el = elementsRef.current.find((x) => x.id === g.id);
      if (!el || !isBox(el)) return;
      // A click without dragging drops a default-sized element.
      const tiny = el.w < 8 && el.h < 8;
      const sized = tiny
        ? g.shape === "frame"
          ? { x: g.start.x - 200, y: g.start.y - 150, w: 400, h: 300 }
          : { x: g.start.x - 80, y: g.start.y - 50, w: 160, h: 100 }
        : {};
      commit(elementsRef.current.map((x) => (x.id === g.id ? ({ ...x, ...sized } as El) : x)), g.base);
      setSelected(new Set([g.id]));
      setTool("select");
    }
    if (g.kind === "connect") {
      const c = elementsRef.current.find((x) => x.id === g.id) as Connector | undefined;
      const { a, b } = c ? connectorPoints(c, new Map(elementsRef.current.map((x) => [x.id, x]))) : { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
      if (!c || Math.hypot(a.x - b.x, a.y - b.y) < 12) apply(g.base);
      else {
        commit(elementsRef.current, g.base);
        setSelected(new Set([g.id]));
      }
    }
  }

  function onDoubleClick(e: MouseEvent<SVGSVGElement>) {
    const id = hitId(e.target);
    const el = id ? elementsRef.current.find((x) => x.id === id) : null;
    if (el && (el.type === "sticky" || el.type === "shape" || el.type === "text" || el.type === "frame")) {
      startEditing(el.id);
      return;
    }
    if (!id && tool === "select") {
      const p = toWorld(e.clientX, e.clientY);
      const sticky: El = { id: uid(), type: "sticky", x: p.x - 85, y: p.y - 75, w: 170, h: 150, text: "", color: STICKY_COLORS[0] };
      commit([...elementsRef.current, sticky]);
      startEditing(sticky.id);
    }
  }

  // ── Keyboard ────────────────────────────────────────────────────────────────────────
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("textarea, input")) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const sel = selectedRef.current;
    let handled = true;
    if (key === " ") setSpaceDown(true);
    else if (mod && key === "z" && !e.shiftKey) undo();
    else if (mod && (key === "y" || (key === "z" && e.shiftKey))) redo();
    else if (mod && key === "d") sel.size && duplicate(sel);
    else if (mod && key === "a") setSelected(new Set(elementsRef.current.map((x) => x.id)));
    else if ((key === "delete" || key === "backspace") && sel.size) removeIds(sel);
    else if (key === "escape") {
      setSelected(new Set());
      setTool("select");
    } else if (key === "enter" && sel.size === 1) startEditing([...sel][0]);
    else if (key.startsWith("arrow") && sel.size) {
      const step = e.shiftKey ? 10 : 1;
      const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
      const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
      const ids = movingIds(sel);
      commit(elementsRef.current.map((x) => (ids.has(x.id) ? move(x, dx, dy) : x)));
    } else if (!mod && (key === "+" || key === "=")) zoomAt(1.2, size.w / 2, size.h / 2);
    else if (!mod && key === "-") zoomAt(1 / 1.2, size.w / 2, size.h / 2);
    else if (!mod && key === "0") fit();
    else if (!mod && !e.altKey && TOOL_KEYS[key]) setTool(TOOL_KEYS[key]);
    else handled = false;
    if (handled) e.preventDefault();
  }

  // ── Toolbar actions ─────────────────────────────────────────────────────────────────
  function loadTemplate(key: string) {
    const t = TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    const els = t.build();
    commit(els);
    setSelected(new Set());
    setMenu(null);
    requestAnimationFrame(() => fit(els));
  }

  async function exportImage() {
    setMenu(null);
    const blob = await exportPng(elementsRef.current, dark);
    if (blob) download(blob, "whiteboard.png");
  }

  function exportJson() {
    setMenu(null);
    download(new Blob([JSON.stringify({ version: 1, elements: elementsRef.current }, null, 2)], { type: "application/json" }), "whiteboard.json");
  }

  async function importJson(file: File) {
    setMenu(null);
    try {
      const data = JSON.parse(await file.text());
      const els = Array.isArray(data) ? data : data.elements;
      if (!Array.isArray(els) || !els.every((x) => x && typeof x.id === "string" && typeof x.type === "string")) throw new Error();
      commit(els);
      requestAnimationFrame(() => fit(els));
    } catch {
      window.alert("That file isn't a whiteboard export.");
    }
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await root.current?.requestFullscreen?.();
    requestAnimationFrame(() => fit());
  }

  // ── Derived render data ─────────────────────────────────────────────────────────────
  const selectedEls = elements.filter((el) => selected.has(el.id));
  const selBox = union(selectedEls.map((el) => bounds(el, byId)));
  const single = selectedEls.length === 1 && isBox(selectedEls[0]) ? selectedEls[0] : null;
  const toScreen = (p: Pt) => ({ x: p.x * view.zoom + view.x, y: p.y * view.zoom + view.y });
  const editingEl = editing ? byId.get(editing) : undefined;
  const colorable = selectedEls.filter((el) => el.type === "sticky" || el.type === "shape");
  const palette = colorable.length && colorable.every((el) => el.type === "sticky") ? STICKY_COLORS : SHAPE_COLORS;
  const frames = elements.filter((el) => el.type === "frame");
  const others = elements.filter((el) => el.type !== "frame");
  const gridSize = GRID * view.zoom;
  const cursor = spaceDown || tool === "hand" ? (gestureKind === "pan" ? "grabbing" : "grab") : tool === "select" ? "default" : "crosshair";
  const handleSize = 10 / view.zoom;

  function renderEl(el: El) {
    const isSel = selected.has(el.id);
    const isEditing = editing === el.id;
    const hover = hoverTarget === el.id;
    if (el.type === "frame") {
      return (
        <g key={el.id} data-id={el.id} className={styles.frame}>
          <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={6} className={styles.frameBody} data-hover={hover} />
          {!isEditing && (
            <text x={el.x} y={el.y - 10} className={styles.frameTitle} style={{ fontSize: Math.max(14, 14 / view.zoom) }}>
              {el.title || "Frame"}
            </text>
          )}
        </g>
      );
    }
    if (el.type === "sticky" || el.type === "shape") {
      const fs = el.type === "sticky" ? fitFont(el.text, el.w, el.h) : fitFont(el.text, el.w * 0.8, el.h * 0.8, 20);
      return (
        <g key={el.id} data-id={el.id} className={styles.item} data-hover={hover}>
          {el.type === "sticky" && <rect x={el.x} y={el.y} width={el.w} height={el.h} fill={el.color} className={styles.sticky} />}
          {el.type === "shape" && el.kind === "rect" && <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={12} fill={el.color} className={styles.shape} />}
          {el.type === "shape" && el.kind === "ellipse" && (
            <ellipse cx={el.x + el.w / 2} cy={el.y + el.h / 2} rx={el.w / 2} ry={el.h / 2} fill={el.color} className={styles.shape} />
          )}
          {el.type === "shape" && el.kind === "diamond" && (
            <polygon
              points={`${el.x + el.w / 2},${el.y} ${el.x + el.w},${el.y + el.h / 2} ${el.x + el.w / 2},${el.y + el.h} ${el.x},${el.y + el.h / 2}`}
              fill={el.color}
              className={styles.shape}
            />
          )}
          {!isEditing && el.text && (
            <foreignObject x={el.x} y={el.y} width={el.w} height={el.h} className={styles.noHit}>
              <div className={styles.label} style={{ fontSize: fs, padding: el.type === "shape" ? "12% 14%" : 12 }}>
                {el.text}
              </div>
            </foreignObject>
          )}
        </g>
      );
    }
    if (el.type === "text") {
      return (
        <g key={el.id} data-id={el.id} className={styles.item}>
          <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="transparent" />
          {!isEditing && (
            <foreignObject x={el.x} y={el.y} width={el.w} height={el.h} className={styles.noHit}>
              <div className={styles.freeText}>{el.text}</div>
            </foreignObject>
          )}
        </g>
      );
    }
    if (el.type === "path") {
      const d = smoothPath(el.points);
      return (
        <g key={el.id} data-id={el.id} className={styles.item}>
          <path d={d} className={styles.hitStroke} style={{ strokeWidth: 14 / view.zoom }} />
          <path d={d} stroke={el.color} className={styles.stroke} />
        </g>
      );
    }
    const { a, b } = connectorPoints(el, byId);
    const live = gesture.current?.kind === "connect" && gesture.current.id === el.id;
    return (
      <g key={el.id} data-id={live ? undefined : el.id} className={live ? styles.noHit : styles.item}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.hitStroke} style={{ strokeWidth: 14 / view.zoom }} />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={isSel ? "var(--accent)" : el.color} className={styles.connector} markerEnd="url(#wb-arrow)" style={{ color: isSel ? "var(--accent)" : el.color }} />
      </g>
    );
  }

  const peopleCount = peers.length + 1;
  const ctxPos = selBox && !editing && !gestureKind ? toScreen({ x: selBox.x + selBox.w / 2, y: selBox.y }) : null;

  return (
    <div
      ref={root}
      className={styles.root}
      tabIndex={0}
      data-active={active}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => e.key === " " && setSpaceDown(false)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setSpaceDown(false)}
      aria-label="Whiteboard. Click to start, scroll to pan, Ctrl plus scroll to zoom."
    >
      <svg
        ref={svg}
        className={styles.canvas}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="wb-grid" width={gridSize} height={gridSize} x={view.x % gridSize} y={view.y % gridSize} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={view.zoom < 0.4 ? 0.6 : 1.1} className={styles.dot} />
          </pattern>
          <marker id="wb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
          <filter id="wb-shadow" x="-10%" y="-10%" width="130%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.18" />
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#wb-grid)" />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {frames.map(renderEl)}
          {others.map(renderEl)}

          {selectedEls.map((el) => {
            const b = bounds(el, byId);
            return <rect key={`sel-${el.id}`} x={b.x - 3 / view.zoom} y={b.y - 3 / view.zoom} width={b.w + 6 / view.zoom} height={b.h + 6 / view.zoom} className={styles.selection} />;
          })}
          {single && !editing && !gestureKind &&
            [
              [single.x, single.y],
              [single.x + single.w, single.y],
              [single.x + single.w, single.y + single.h],
              [single.x, single.y + single.h],
            ].map(([x, y], i) => (
              <rect
                key={i}
                data-handle={i}
                x={x - handleSize / 2}
                y={y - handleSize / 2}
                width={handleSize}
                height={handleSize}
                className={styles.handle}
                style={{ cursor: i % 2 === 0 ? "nwse-resize" : "nesw-resize", strokeWidth: 1.5 / view.zoom }}
              />
            ))}
          {guides.map((g, i) =>
            g.x !== undefined ? (
              <line key={i} x1={g.x} x2={g.x} y1={-1e5} y2={1e5} className={styles.guide} />
            ) : (
              <line key={i} y1={g.y} y2={g.y} x1={-1e5} x2={1e5} className={styles.guide} />
            ),
          )}
          {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} className={styles.marquee} />}
        </g>
      </svg>

      {/* Remote cursors */}
      {peers.map((p) => {
        if (p.x === undefined || p.y === undefined) return null;
        const s = toScreen({ x: p.x, y: p.y });
        return (
          <div key={p.id} className={styles.peer} style={{ transform: `translate(${s.x}px, ${s.y}px)`, color: p.color }}>
            <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
              <path d="M1 1l5.5 14 2-6 6-2z" fill="currentColor" stroke="#fff" strokeWidth="1.2" />
            </svg>
            <span style={{ background: p.color }}>{p.name}</span>
          </div>
        );
      })}

      {/* Inline text editor */}
      {editingEl && isBox(editingEl) && (() => {
        const s = toScreen(editingEl);
        const isFrame = editingEl.type === "frame";
        const fs =
          editingEl.type === "sticky"
            ? fitFont(editingEl.text, editingEl.w, editingEl.h)
            : editingEl.type === "shape"
              ? fitFont(editingEl.text, editingEl.w * 0.8, editingEl.h * 0.8, 20)
              : 22;
        if (isFrame) {
          return (
            <input
              autoFocus
              data-editor
              className={styles.frameInput}
              style={{ left: s.x, top: s.y - 34, width: Math.max(160, editingEl.w * view.zoom) }}
              value={editingEl.title}
              onChange={(e) => editText(e.target.value)}
              onBlur={finishEditing}
              onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && finishEditing()}
            />
          );
        }
        return (
          <textarea
            autoFocus
            data-editor
            className={styles.editor}
            data-kind={editingEl.type}
            style={{
              left: s.x,
              top: s.y,
              width: editingEl.w * view.zoom,
              height: editingEl.type === "text" ? undefined : editingEl.h * view.zoom,
              fontSize: fs * view.zoom,
              background: editingEl.type === "sticky" || editingEl.type === "shape" ? "transparent" : undefined,
            }}
            value={"text" in editingEl ? editingEl.text : ""}
            placeholder={editingEl.type === "text" ? "Type something" : ""}
            onChange={(e) => {
              const area = e.target;
              if (editingEl.type === "text") {
                area.style.height = "auto";
                area.style.height = `${area.scrollHeight}px`;
              }
              editText(area.value, editingEl.type === "text" ? area.scrollHeight / view.zoom : undefined);
            }}
            onBlur={finishEditing}
            onKeyDown={(e) => {
              if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
                e.preventDefault();
                finishEditing();
              }
            }}
          />
        );
      })()}

      {/* Floating context toolbar */}
      {ctxPos && selected.size > 0 && (
        <div
          className={styles.context}
          style={{ left: clamp(ctxPos.x, 140, size.w - 140), top: Math.max(8, ctxPos.y - 56) }}
          onPointerDown={keepBoardFocus}
        >
          {colorable.length > 0 &&
            palette.map((c) => (
              <button key={c} type="button" className={styles.swatch} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => recolor(selected, c)} />
            ))}
          {colorable.length > 0 && <span className={styles.divider} />}
          <button type="button" className={styles.ctxBtn} title="Bring to front" onClick={() => reorder(selected, true)}>
            <Icon>
              <path d="M8 8h12v12H8zM4 16V4h12" />
            </Icon>
          </button>
          <button type="button" className={styles.ctxBtn} title="Send to back" onClick={() => reorder(selected, false)}>
            <Icon>
              <path d="M4 4h12v12H4zM20 8v12H8" />
            </Icon>
          </button>
          <button type="button" className={styles.ctxBtn} title="Duplicate (Ctrl+D)" onClick={() => duplicate(selected)}>
            <Icon>
              <path d="M9 9h11v11H9zM5 15H4V4h11v1" />
            </Icon>
          </button>
          <button type="button" className={styles.ctxBtn} title="Delete (Del)" onClick={() => removeIds(selected)}>
            <Icon>
              <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
            </Icon>
          </button>
        </div>
      )}

      {/* Left tool rail */}
      <div className={styles.rail} role="toolbar" aria-label="Tools" onPointerDown={keepBoardFocus}>
        {TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={styles.tool}
            aria-pressed={tool === t.key}
            title={`${t.label} (${t.shortcut})`}
            onClick={() => {
              setTool(t.key);
              setActive(true);
            }}
          >
            <Icon>{t.icon}</Icon>
          </button>
        ))}
        <span className={styles.railDivider} />
        <button type="button" className={styles.tool} aria-expanded={menu === "templates"} title="Templates" onClick={() => setMenu(menu === "templates" ? null : "templates")}>
          <Icon>
            <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
          </Icon>
        </button>
        <button type="button" className={styles.tool} aria-expanded={menu === "export"} title="Export / import" onClick={() => setMenu(menu === "export" ? null : "export")}>
          <Icon>
            <path d="M12 4v11m0 0-4-4m4 4 4-4M4 17v3h16v-3" />
          </Icon>
        </button>
        {menu === "templates" && (
          <div className={styles.menu}>
            <span className={styles.menuTitle}>Start from a template</span>
            {TEMPLATES.map((t) => (
              <button key={t.key} type="button" onClick={() => loadTemplate(t.key)}>
                {t.label}
              </button>
            ))}
            <span className={styles.menuNote}>Replaces the board · Undo with Ctrl+Z</span>
          </div>
        )}
        {menu === "export" && (
          <div className={styles.menu}>
            <button type="button" onClick={exportImage}>
              Download PNG
            </button>
            <button type="button" onClick={exportJson}>
              Download JSON
            </button>
            <label className={styles.menuFile}>
              Import JSON…
              <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
            </label>
          </div>
        )}
      </div>

      {/* Top bar: undo/redo, people, fullscreen */}
      <div className={styles.topbar} onPointerDown={keepBoardFocus}>
        <button type="button" className={styles.ctxBtn} title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <Icon>
            <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
          </Icon>
        </button>
        <button type="button" className={styles.ctxBtn} title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
          <Icon>
            <path d="m15 14 5-5-5-5m5 5H10a6 6 0 0 0 0 12h3" />
          </Icon>
        </button>
        <span className={styles.divider} />
        <div className={styles.avatars} title={`${peopleCount} ${peopleCount === 1 ? "person" : "people"} on this board`}>
          {me && (
            <span className={styles.avatar} style={{ background: me.color }} title={`${me.name} (you)`}>
              {me.name.split(" ")[1][0]}
            </span>
          )}
          {peers.slice(0, 4).map((p) => (
            <span key={p.id} className={styles.avatar} style={{ background: p.color }} title={p.name}>
              {p.name.split(" ")[1][0]}
            </span>
          ))}
        </div>
        <button
          type="button"
          className={styles.invite}
          title="Open this board in another tab to see live collaboration"
          onClick={() => window.open(window.location.href, "_blank", "noopener")}
        >
          {peers.length ? `${peopleCount} live` : "Invite (new tab)"}
        </button>
        <button type="button" className={styles.ctxBtn} title="Full screen" onClick={toggleFullscreen}>
          <Icon>
            <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
          </Icon>
        </button>
      </div>

      {/* Zoom controls */}
      <div className={styles.zoombar} onPointerDown={keepBoardFocus}>
        <button type="button" className={styles.ctxBtn} title="Zoom out (−)" onClick={() => zoomAt(1 / 1.2, size.w / 2, size.h / 2)}>
          −
        </button>
        <button type="button" className={styles.zoomValue} title="Reset to 100%" onClick={() => zoomAt(1 / view.zoom, size.w / 2, size.h / 2)}>
          {Math.round(view.zoom * 100)}%
        </button>
        <button type="button" className={styles.ctxBtn} title="Zoom in (+)" onClick={() => zoomAt(1.2, size.w / 2, size.h / 2)}>
          +
        </button>
        <button type="button" className={styles.fitBtn} title="Fit to content (0)" onClick={() => fit()}>
          Fit
        </button>
      </div>

      <Minimap elements={elements} byId={byId} view={view} size={size} onCenter={(p) => setView((v) => ({ ...v, x: size.w / 2 - p.x * v.zoom, y: size.h / 2 - p.y * v.zoom }))} />

      {!active && (
        <div className={styles.hint} aria-hidden="true">
          Click the board to start · Scroll to pan · Ctrl + scroll to zoom · Double-click for a sticky
        </div>
      )}
    </div>
  );
}

function Minimap({
  elements,
  byId,
  view,
  size,
  onCenter,
}: {
  elements: El[];
  byId: Map<string, El>;
  view: View;
  size: { w: number; h: number };
  onCenter: (p: Pt) => void;
}) {
  const W = 180;
  const H = 116;
  const viewport: Box = { x: -view.x / view.zoom, y: -view.y / view.zoom, w: size.w / view.zoom, h: size.h / view.zoom };
  const content = union(elements.map((e) => bounds(e, byId)));
  const world = union(content ? [content, viewport] : [viewport])!;
  const pad = Math.max(world.w, world.h) * 0.08;
  const scale = Math.min(W / (world.w + pad * 2), H / (world.h + pad * 2));
  const ox = (W - (world.w + pad * 2) * scale) / 2 - (world.x - pad) * scale;
  const oy = (H - (world.h + pad * 2) * scale) / 2 - (world.y - pad) * scale;
  const dragging = useRef(false);

  const toWorld = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left - ox) / scale, y: (e.clientY - r.top - oy) / scale };
  };

  return (
    <svg
      className={styles.minimap}
      width={W}
      height={H}
      aria-label="Mini map. Click to move the view."
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        onCenter(toWorld(e));
      }}
      onPointerMove={(e) => dragging.current && onCenter(toWorld(e))}
      onPointerUp={() => (dragging.current = false)}
    >
      <g transform={`translate(${ox} ${oy}) scale(${scale})`}>
        {elements.map((el) => {
          if (el.type === "connector") return null;
          const fill = el.type === "sticky" || el.type === "shape" ? el.color : el.type === "frame" ? "var(--frame-bg)" : "var(--mini-ink)";
          return <rect key={el.id} x={el.x} y={el.y} width={el.w} height={el.h} fill={fill} stroke="var(--mini-ink)" strokeOpacity={0.35} vectorEffect="non-scaling-stroke" />;
        })}
        <rect x={viewport.x} y={viewport.y} width={viewport.w} height={viewport.h} className={styles.miniView} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
