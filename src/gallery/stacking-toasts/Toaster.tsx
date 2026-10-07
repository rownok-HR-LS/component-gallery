"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { type ToastItem, type ToastType } from "./useToaster";
import styles from "./Toaster.module.css";

type Props = {
  toasts: ToastItem[];
  onDismiss: (id: number, exitX?: number) => void;
};

const GAP = 10;
const PEEK = 14; // how much each older toast peeks out above the one in front
const VISIBLE_WHEN_STACKED = 3;
const SWIPE_DISMISS = 90;

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <path d="M7 12.5l3 3 7-7" />,
  error: <path d="M9 9l6 6m0-6-6 6" />,
  warning: <path d="M12 8v5m0 3.2v.1" />,
  info: <path d="M12 11v5m0-8.2v.1" />,
  loading: null,
};

export default function Toaster({ toasts, onDismiss }: Props) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [heights, setHeights] = useState<Record<number, number>>({});

  // Newest toast is at the front (index 0).
  const ordered = [...toasts].reverse();
  const live = ordered.filter((t) => !t.removing);
  const expanded = (hovered || focused) && live.length > 0;
  const paused = hovered || focused;
  const frontHeight = heights[live[0]?.id] ?? 64;

  // Collapse once the last toast is gone, so the next one starts stacked.
  useEffect(() => {
    if (toasts.length === 0) setFocused(false);
  }, [toasts.length]);

  let offset = 0;
  const offsets = new Map<number, number>();
  live.forEach((t, i) => {
    offsets.set(t.id, offset);
    offset += (heights[t.id] ?? 64) + GAP;
    if (i === live.length - 1) offset -= GAP;
  });

  const stackHeight = live.length === 0 ? 0 : expanded ? offset : frontHeight + PEEK * Math.min(live.length - 1, VISIBLE_WHEN_STACKED - 1);

  return (
    <section
      className={styles.region}
      aria-label="Notifications"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
      }}
    >
      <ol className={styles.stack} style={{ height: stackHeight }} data-expanded={expanded}>
        {ordered.map((toast) => {
          const index = live.indexOf(toast);
          return (
            <Toast
              key={toast.id}
              toast={toast}
              index={index < 0 ? 0 : index}
              expanded={expanded}
              offset={offsets.get(toast.id) ?? 0}
              frontHeight={frontHeight}
              height={heights[toast.id]}
              paused={paused}
              onHeight={(h) => setHeights((prev) => (prev[toast.id] === h ? prev : { ...prev, [toast.id]: h }))}
              onDismiss={onDismiss}
            />
          );
        })}
      </ol>
    </section>
  );
}

type ToastProps = {
  toast: ToastItem;
  index: number;
  expanded: boolean;
  offset: number;
  frontHeight: number;
  height: number | undefined;
  paused: boolean;
  onHeight: (height: number) => void;
  onDismiss: (id: number, exitX?: number) => void;
};

function Toast({ toast, index, expanded, offset, frontHeight, height, paused, onHeight, onDismiss }: ToastProps) {
  const inner = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [drag, setDrag] = useState<{ startX: number; dx: number } | null>(null);
  const remaining = useRef(toast.duration);
  const lastPosition = useRef({ y: 0, scale: 1 });

  useLayoutEffect(() => {
    // +2 for the top and bottom border of the list item.
    if (inner.current) onHeight(inner.current.offsetHeight + 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.version]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Restart the countdown whenever the toast is updated (e.g. loading → success).
  useEffect(() => {
    remaining.current = toast.duration;
  }, [toast.version, toast.duration]);

  // Auto-dismiss, pausing while the stack is hovered or focused.
  useEffect(() => {
    if (paused || toast.removing || drag || !Number.isFinite(toast.duration)) return;
    const started = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, toast.removing, toast.version, toast.duration, toast.id, drag, onDismiss]);

  function onPointerDown(e: PointerEvent<HTMLLIElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ startX: e.clientX, dx: 0 });
  }
  function onPointerMove(e: PointerEvent<HTMLLIElement>) {
    if (drag) setDrag({ ...drag, dx: e.clientX - drag.startX });
  }
  function onPointerUp() {
    if (!drag) return;
    if (Math.abs(drag.dx) > SWIPE_DISMISS) onDismiss(toast.id, Math.sign(drag.dx) * 420);
    setDrag(null);
  }

  const stacked = !expanded;
  const hidden = stacked && index >= VISIBLE_WHEN_STACKED;
  let x = drag?.dx ?? 0;
  let y = stacked ? -index * PEEK : -offset;
  let scale = stacked ? 1 - index * 0.06 : 1;
  let opacity = hidden ? 0 : 1 - Math.min(Math.abs(x) / 260, 0.7);

  if (!mounted) {
    y = 80;
    opacity = 0;
  }
  if (toast.removing) {
    // Leave from where it was, not from the slot it would get after removal.
    ({ y, scale } = lastPosition.current);
    if (toast.exitX) x = toast.exitX;
    else y += 24;
    opacity = 0;
    scale *= 0.96;
  } else if (mounted) {
    lastPosition.current = { y, scale };
  }

  const timed = Number.isFinite(toast.duration);

  return (
    <li
      className={styles.toast}
      data-type={toast.type}
      data-dragging={Boolean(drag)}
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      style={{
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        opacity,
        zIndex: 50 - index,
        // When stacked, older toasts take the front toast's height so their peeks line up.
        height: stacked && index > 0 ? frontHeight : height,
        pointerEvents: hidden || toast.removing ? "none" : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={inner} className={styles.inner} aria-hidden={hidden || undefined}>
        <span className={styles.icon} data-type={toast.type} aria-hidden="true">
          {toast.type === "loading" ? (
            <span className={styles.spinner} />
          ) : (
            <svg viewBox="0 0 24 24">{ICONS[toast.type]}</svg>
          )}
        </span>
        <div className={styles.text}>
          <p className={styles.title}>{toast.title}</p>
          {toast.description && <p className={styles.description}>{toast.description}</p>}
        </div>
        {toast.action && (
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              toast.action!.onClick();
              onDismiss(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        )}
        <button type="button" className={styles.close} aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7 7 17" />
          </svg>
        </button>
      </div>
      {timed && (
        <span
          key={toast.version}
          className={styles.progress}
          style={{ animationDuration: `${toast.duration}ms`, animationPlayState: paused || drag ? "paused" : "running" }}
        />
      )}
    </li>
  );
}
