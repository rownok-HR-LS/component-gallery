"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Game, H, POWERS, W, type Snapshot } from "./engine";
import { LEVELS } from "./levels";
import { Sound } from "./sound";
import styles from "./BrickBlaster.module.css";

const BEST_KEY = "brick-blaster-best";

export default function BrickBlaster() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const sound = useRef<Sound | null>(null);
  const [hud, setHud] = useState<Snapshot | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const s = new Sound();
    const g = new Game(s);
    try {
      g.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {}
    g.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    g.onBest = (score) => {
      try {
        localStorage.setItem(BEST_KEY, String(score));
      } catch {}
    };
    sound.current = s;
    game.current = g;
    setHud(g.snapshot());

    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    let scale = 1;
    const resize = () => {
      const w = el.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(w * dpr);
      el.height = Math.round(((w * H) / W) * dpr);
      scale = el.width / W;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    let last = performance.now();
    let lastHud = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      g.update(dt);
      g.render(ctx, scale);
      if (now - lastHud > 100) {
        lastHud = now;
        setHud(g.snapshot());
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Pause when the tab is hidden.
    const onVisibility = () => document.hidden && g.phase === "playing" && g.togglePause();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const act = () => {
    sound.current?.unlock();
    game.current?.action();
    wrap.current?.focus({ preventScroll: true });
  };

  function aim(clientX: number) {
    const g = game.current;
    const el = canvas.current;
    if (!g || !el) return;
    const r = el.getBoundingClientRect();
    g.paddle.targetX = ((clientX - r.left) / r.width) * W;
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>, down: boolean) {
    const g = game.current;
    if (!g) return;
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") g.keys.left = down;
    else if (k === "arrowright" || k === "d") g.keys.right = down;
    else if (down && (k === " " || k === "enter")) act();
    else if (down && (k === "p" || k === "escape")) g.togglePause();
    else if (down && k === "m") toggleMute();
    else return;
    e.preventDefault();
  }

  function toggleMute() {
    if (!sound.current) return;
    sound.current.muted = !sound.current.muted;
    setMuted(sound.current.muted);
  }

  const phase = hud?.phase;

  return (
    <div className={styles.shell}>
      <div className={styles.hud} aria-live="off">
        <div className={styles.stat}>
          <span>Score</span>
          <strong>{hud?.score.toLocaleString() ?? 0}</strong>
        </div>
        <div className={styles.stat}>
          <span>Level</span>
          <strong>
            {hud?.level ?? 1}
            <small>/{LEVELS.length}</small>
          </strong>
        </div>
        <div className={styles.stat}>
          <span>Lives</span>
          <strong className={styles.lives} aria-label={`${hud?.lives ?? 3} lives`}>
            {"●".repeat(Math.max(0, hud?.lives ?? 3))}
          </strong>
        </div>
        <div className={styles.powers}>
          {hud?.shield && <span className={styles.power} style={{ ["--c" as string]: POWERS.shield.color }}>Shield</span>}
          {hud?.timers.map((t) => (
            <span key={t.kind} className={styles.power} style={{ ["--c" as string]: POWERS[t.kind].color }}>
              {POWERS[t.kind].label}
              <i style={{ width: `${(t.left / t.total) * 100}%` }} />
            </span>
          ))}
        </div>
        <div className={styles.hudButtons}>
          <button type="button" onClick={toggleMute} aria-pressed={muted} title="Sound (M)">
            {muted ? "Sound off" : "Sound on"}
          </button>
          <button type="button" onClick={() => game.current?.togglePause()} disabled={phase !== "playing" && phase !== "paused"} title="Pause (P)">
            {phase === "paused" ? "Resume" : "Pause"}
          </button>
        </div>
      </div>

      <div
        ref={wrap}
        className={styles.stage}
        tabIndex={0}
        role="application"
        aria-label="Brick Blaster game. Move with the mouse or arrow keys, Space to launch."
        onKeyDown={(e) => onKey(e, true)}
        onKeyUp={(e) => onKey(e, false)}
        onBlur={() => {
          if (game.current) game.current.keys = { left: false, right: false };
        }}
      >
        <canvas
          ref={canvas}
          className={styles.canvas}
          onPointerMove={(e) => aim(e.clientX)}
          onPointerDown={(e) => {
            aim(e.clientX);
            if (e.pointerType === "touch") e.currentTarget.setPointerCapture(e.pointerId);
            act();
          }}
        />

        {phase === "title" && (
          <div className={styles.overlay}>
            <h3 className={styles.logo}>
              BRICK <span>BLASTER</span>
            </h3>
            <p className={styles.tagline}>A tribute to the classic DX-Ball</p>
            <button type="button" className={styles.play} onClick={act}>
              Play
            </button>
            <ul className={styles.help}>
              <li>
                <kbd>Mouse</kbd> / <kbd>←</kbd> <kbd>→</kbd> move the paddle
              </li>
              <li>
                <kbd>Click</kbd> / <kbd>Space</kbd> launch · fire laser
              </li>
              <li>
                <kbd>P</kbd> pause · <kbd>M</kbd> sound
              </li>
            </ul>
            <div className={styles.legend}>
              {(Object.keys(POWERS) as (keyof typeof POWERS)[]).map((k) => (
                <span key={k} style={{ ["--c" as string]: POWERS[k].color }} title={POWERS[k].good ? "Good" : "Bad"}>
                  <b>{POWERS[k].letter}</b>
                  {POWERS[k].label}
                </span>
              ))}
            </div>
            {hud && hud.best > 0 && <p className={styles.best}>Best: {hud.best.toLocaleString()}</p>}
          </div>
        )}
        {phase === "paused" && (
          <div className={styles.overlay}>
            <h3 className={styles.big}>Paused</h3>
            <button type="button" className={styles.play} onClick={() => game.current?.togglePause()}>
              Resume
            </button>
          </div>
        )}
        {(phase === "gameOver" || phase === "won") && hud && (
          <div className={styles.overlay}>
            <h3 className={styles.big}>{phase === "won" ? "You cleared every level!" : "Game over"}</h3>
            <p className={styles.final}>
              {hud.score.toLocaleString()} <span>points</span>
            </p>
            <p className={styles.best}>{hud.score >= hud.best && hud.score > 0 ? "New best score!" : `Best: ${hud.best.toLocaleString()}`}</p>
            <button type="button" className={styles.play} onClick={act}>
              Play again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
