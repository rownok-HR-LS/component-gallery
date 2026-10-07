"use client";

import { useEffect, useRef, type ButtonHTMLAttributes } from "react";
import styles from "./MorphButton.module.css";

export type Status = "idle" | "loading" | "success" | "error";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  status: Status;
  label: string;
  /** Read out by screen readers for each state. */
  messages?: Partial<Record<Exclude<Status, "idle">, string>>;
};

const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"];

type Particle = { x: number; y: number; vx: number; vy: number; size: number; spin: number; angle: number; color: string; round: boolean };

function burst(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const particles: Particle[] = Array.from({ length: 70 }, () => {
    // Mostly upwards, fanning out to the sides.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 4 + Math.random() * 6;
    return {
      x: width / 2,
      y: height / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 4 + Math.random() * 5,
      spin: (Math.random() - 0.5) * 0.4,
      angle: Math.random() * Math.PI,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      round: Math.random() < 0.3,
    };
  });

  let frame = 0;
  let raf = 0;
  const tick = () => {
    frame++;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = Math.max(0, 1 - frame / 75);
    for (const p of particles) {
      p.vy += 0.22;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size, p.size, p.size * 1.8);
      }
      ctx.restore();
    }
    if (frame < 75) raf = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, width, height);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export default function MorphButton({ status, label, messages, className, ...rest }: Props) {
  const confetti = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (status !== "success" || !confetti.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return burst(confetti.current);
  }, [status]);

  const busy = status !== "idle";
  const announce = status === "idle" ? "" : messages?.[status] ?? "";

  return (
    <span className={styles.wrap}>
      <canvas ref={confetti} className={styles.confetti} aria-hidden="true" />
      <button
        {...rest}
        className={`${styles.button} ${className ?? ""}`}
        data-status={status}
        aria-disabled={busy}
        onClick={busy ? (e) => e.preventDefault() : rest.onClick}
      >
        <span className={styles.fill} data-tone="success" />
        <span className={styles.fill} data-tone="error" />
        <span className={styles.label}>{label}</span>
        <svg className={styles.spinner} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
        </svg>
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
