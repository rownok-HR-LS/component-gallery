"use client";

import { useEffect, useRef, type ButtonHTMLAttributes } from "react";
import styles from "./MorphButton.module.css";

export type Status = "idle" | "loading" | "success" | "error";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  status: Status;
  label: string;
  /** Stretch to the container's width while idle. */
  block?: boolean;
  /** Read out by screen readers for each state. */
  messages?: Partial<Record<Exclude<Status, "idle">, string>>;
};

const COLORS = ["#8b7dff", "#4cc9f0", "#f72585", "#ffd166", "#06d6a0", "#ffffff"];
const LIFETIME = 110;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  spin: number;
  angle: number;
  flip: number;
  flipSpeed: number;
  color: string;
  round: boolean;
};

function burst(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const particles: Particle[] = Array.from({ length: 110 }, () => {
    // Two fans, up-left and up-right, so the burst frames the button.
    const side = Math.random() < 0.5 ? -1 : 1;
    const angle = -Math.PI / 2 + side * (0.25 + Math.random() * 0.75);
    const speed = 5 + Math.random() * 7;
    return {
      x: width / 2,
      y: height / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 5 + Math.random() * 4,
      h: 8 + Math.random() * 6,
      spin: (Math.random() - 0.5) * 0.3,
      angle: Math.random() * Math.PI,
      flip: Math.random() * Math.PI,
      flipSpeed: 0.15 + Math.random() * 0.2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      round: Math.random() < 0.25,
    };
  });

  let frame = 0;
  let raf = 0;
  const tick = () => {
    frame++;
    ctx.clearRect(0, 0, width, height);
    // Full strength for most of the flight, then fade out.
    ctx.globalAlpha = frame < 75 ? 1 : Math.max(0, 1 - (frame - 75) / (LIFETIME - 75));
    for (const p of particles) {
      p.vy += 0.2;
      p.vx *= 0.97;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      p.flip += p.flipSpeed;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Squashing the height makes the paper look like it's flipping.
        const h = p.h * Math.abs(Math.cos(p.flip));
        ctx.fillRect(-p.w / 2, -h / 2, p.w, Math.max(1, h));
      }
      ctx.restore();
    }
    if (frame < LIFETIME) raf = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, width, height);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export default function MorphButton({ status, label, block = false, messages, className, ...rest }: Props) {
  const confetti = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (status !== "success" || !confetti.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return burst(confetti.current);
  }, [status]);

  const busy = status !== "idle";
  const announce = status === "idle" ? "" : messages?.[status] ?? "";

  return (
    <span className={styles.wrap} data-block={block}>
      <canvas ref={confetti} className={styles.confetti} aria-hidden="true" />
      <button
        {...rest}
        className={`${styles.button} ${className ?? ""}`}
        data-status={status}
        aria-disabled={busy}
        onClick={busy ? (e) => e.preventDefault() : rest.onClick}
      >
        <span className={styles.halo} aria-hidden="true" />
        <span className={styles.ring} aria-hidden="true" />
        <span className={styles.surface} aria-hidden="true" />
        <span className={styles.fill} data-tone="success" aria-hidden="true" />
        <span className={styles.fill} data-tone="error" aria-hidden="true" />
        <span className={styles.pulse} aria-hidden="true" />
        <span className={styles.content}>
          <span className={styles.label}>{label}</span>
          <svg className={styles.plane} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5 21 3Z" />
          </svg>
        </span>
        <svg className={styles.check} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
        <svg className={styles.cross} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7l10 10M17 7 7 17" />
        </svg>
      </button>
      <span className={styles.srOnly} aria-live="polite">
        {announce}
      </span>
    </span>
  );
}
