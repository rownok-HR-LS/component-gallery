"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./SpinWheel.module.css";

const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7", "#e34948", "#0e9aa7"];
const SAMPLE = ["Ayesha", "Rahim", "Nusrat", "Tanvir", "Farhan", "Mitu", "Sadia", "Imran"];
const MAX_ENTRIES = 40;
const DURATION = 5200;

// Wheel geometry in a 400×400 viewBox.
const C = 200;
const R_SEGMENT = 178;
const R_BULBS = 190;
const BULBS = 24;

const randomFloat = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const mod = (n: number, m: number) => ((n % m) + m) % m;

function point(angle: number, r: number) {
  const a = (angle * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

function slicePath(a0: number, a1: number) {
  const [x0, y0] = point(a0, R_SEGMENT);
  const [x1, y1] = point(a1, R_SEGMENT);
  return `M${C},${C} L${x0},${y0} A${R_SEGMENT},${R_SEGMENT} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1} Z`;
}

// Avoid the last slice matching the first when the count wraps around the palette.
function sliceColor(i: number, n: number) {
  return n % COLORS.length === 1 && i === n - 1 ? COLORS[1] : COLORS[i % COLORS.length];
}

function textColor(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#1a1a1a" : "#ffffff";
}

/** Wheel angle currently under the top pointer, for a wheel rotated `rotation` degrees clockwise. */
const angleUnderPointer = (rotation: number) => mod(-rotation, 360);

export default function SpinWheel() {
  const [text, setText] = useState(SAMPLE.join("\n"));
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<{ index: number; name: string } | null>(null);
  const [autoRemove, setAutoRemove] = useState(false);
  const [sound, setSound] = useState(true);
  const [history, setHistory] = useState<string[]>([]);

  const wheel = useRef<SVGGElement>(null);
  const pointer = useRef<SVGGElement>(null);
  const rotation = useRef(0);
  const raf = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const soundOn = useRef(sound);
  soundOn.current = sound;

  const names = useMemo(
    () => text.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, MAX_ENTRIES),
    [text],
  );
  const n = names.length;
  const seg = 360 / Math.max(n, 1);
  const fontSize = n <= 8 ? 17 : n <= 14 ? 14 : n <= 24 ? 11 : 9;
  const maxChars = n <= 14 ? 14 : 10;

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  function setWheelRotation(deg: number) {
    rotation.current = deg;
    wheel.current?.setAttribute("transform", `rotate(${deg} ${C} ${C})`);
  }

  function tick() {
    pointer.current?.animate([{ transform: "rotate(-26deg)" }, { transform: "rotate(0deg)" }], { duration: 140, easing: "ease-out" });
    const ctx = audio.current;
    if (!soundOn.current || !ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 1500;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  function spin() {
    if (spinning) return;
    // Optionally drop the previous winner before the next spin.
    const entries = autoRemove && winner ? names.filter((_, i) => i !== winner.index) : names;
    if (entries.length < 2) return;
    if (entries !== names) setText(entries.join("\n"));
    setWinner(null);

    if (soundOn.current) {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    }

    const count = entries.length;
    const slice = 360 / count;
    // The winner is chosen first with a secure random number; the animation just lands on it.
    const w = Math.floor(randomFloat() * count);
    const target = (w + 0.15 + randomFloat() * 0.7) * slice;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const turns = reduced ? 0 : 5 + Math.floor(randomFloat() * 3);
    const start = rotation.current;
    const delta = turns * 360 + mod(-target - start, 360);
    const duration = reduced ? 500 : DURATION;
    const t0 = performance.now();
    let lastSlice = Math.floor(angleUnderPointer(start) / slice);

    setSpinning(true);
    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const r = start + delta * (1 - (1 - t) ** 4);
      setWheelRotation(r);
      const current = Math.floor(angleUnderPointer(r) / slice);
      if (current !== lastSlice) {
        lastSlice = current;
        if (!reduced) tick();
      }
      if (t < 1) {
        raf.current = requestAnimationFrame(frame);
        return;
      }
      setSpinning(false);
      setWinner({ index: w, name: entries[w] });
      setHistory((h) => [entries[w], ...h].slice(0, 8));
    };
    raf.current = requestAnimationFrame(frame);
  }

  function editEntries(value: string) {
    setText(value);
    setWinner(null);
  }

  function shuffle() {
    const copy = [...names];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(randomFloat() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    editEntries(copy.join("\n"));
  }

  function removeWinner() {
    if (!winner) return;
    editEntries(names.filter((_, i) => i !== winner.index).join("\n"));
  }

  return (
    <div className={styles.card}>
      <header className={styles.head}>
        <h3 className={styles.title}>Spin the wheel</h3>
        <p className={styles.subtitle}>A fair random pick for raffles, turns and team decisions.</p>
      </header>

      <div className={styles.body}>
        <div className={styles.stage}>
          <div className={styles.wheelWrap} data-spinning={spinning}>
            <svg viewBox="0 0 400 400" className={styles.wheel} aria-hidden="true">
              <defs>
                <radialGradient id="wheel-shade" cx="50%" cy="50%" r="50%">
                  <stop offset="60%" stopColor="#000" stopOpacity="0" />
                  <stop offset="100%" stopColor="#000" stopOpacity="0.22" />
                </radialGradient>
              </defs>
              <circle cx={C} cy={C} r={198} className={styles.rim} />
              {Array.from({ length: BULBS }, (_, i) => {
                const [x, y] = point((360 / BULBS) * i, R_BULBS);
                return <circle key={i} cx={x} cy={y} r={3.4} className={styles.bulb} data-odd={i % 2 === 1} />;
              })}

              <g ref={wheel}>
                {n < 2 ? (
                  <circle cx={C} cy={C} r={R_SEGMENT} className={styles.empty} />
                ) : (
                  names.map((name, i) => {
                    const a0 = i * seg;
                    const mid = a0 + seg / 2;
                    const fill = sliceColor(i, n);
                    const label = name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name;
                    return (
                      <g key={`${i}-${name}`} className={styles.slice} data-dim={winner !== null && winner.index !== i}>
                        <path d={slicePath(a0, a0 + seg)} fill={fill} />
                        <text
                          x={C + R_SEGMENT - 16}
                          y={C}
                          textAnchor="end"
                          dominantBaseline="middle"
                          fontSize={fontSize}
                          fill={textColor(fill)}
                          transform={`rotate(${mid - 90} ${C} ${C})`}
                          className={styles.label}
                        >
                          {label}
                        </text>
                      </g>
                    );
                  })
                )}
                {n >= 2 &&
                  names.map((_, i) => {
                    const [x, y] = point(i * seg, R_SEGMENT - 3);
                    return <circle key={`peg-${i}`} cx={x} cy={y} r={3} className={styles.peg} />;
                  })}
                <circle cx={C} cy={C} r={R_SEGMENT} fill="url(#wheel-shade)" pointerEvents="none" />
              </g>

              <g ref={pointer} className={styles.pointer}>
                <path d="M200 30 L186 4 Q200 -4 214 4 Z" />
              </g>
            </svg>

            <button
              type="button"
              className={styles.hub}
              onClick={spin}
              disabled={spinning || n < 2}
              aria-label={n < 2 ? "Add at least two entries to spin" : "Spin the wheel"}
            >
              {spinning ? "…" : "SPIN"}
            </button>

            {n < 2 && <p className={styles.emptyHint}>Add at least 2 entries</p>}

            {winner && (
              <div className={styles.winner} role="dialog" aria-label="Winner">
                <span className={styles.winnerKicker}>The wheel chose</span>
                <strong className={styles.winnerName}>{winner.name}</strong>
                <div className={styles.winnerActions}>
                  <button type="button" onClick={removeWinner} className={styles.ghost}>
                    Remove
                  </button>
                  <button type="button" onClick={spin} className={styles.primary}>
                    Spin again
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className={styles.srOnly} aria-live="polite">
            {spinning ? "Spinning…" : winner ? `Winner: ${winner.name}` : ""}
          </p>
        </div>

        <div className={styles.panel}>
          <label className={styles.entriesLabel}>
            <span>
              Entries <span className={styles.count}>{n}</span>
            </span>
            <span className={styles.entriesHint}>one per line</span>
          </label>
          <textarea
            className={styles.entries}
            value={text}
            rows={9}
            spellCheck={false}
            disabled={spinning}
            onChange={(e) => editEntries(e.target.value)}
            aria-label="Entries, one per line"
          />
          <div className={styles.tools}>
            <button type="button" onClick={shuffle} disabled={spinning || n < 2}>
              Shuffle
            </button>
            <button type="button" onClick={() => editEntries("")} disabled={spinning || n === 0}>
              Clear
            </button>
            <button type="button" onClick={() => editEntries(SAMPLE.join("\n"))} disabled={spinning}>
              Sample
            </button>
          </div>

          <label className={styles.toggle}>
            <input type="checkbox" checked={autoRemove} onChange={(e) => setAutoRemove(e.target.checked)} />
            Remove the winner before the next spin
          </label>
          <label className={styles.toggle}>
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
            Tick sound
          </label>

          <button type="button" className={styles.spinButton} onClick={spin} disabled={spinning || n < 2}>
            {spinning ? "Spinning…" : "Spin"}
          </button>

          {history.length > 0 && (
            <div className={styles.history}>
              <span>Recent picks</span>
              <ol>
                {history.map((name, i) => (
                  <li key={i}>{name}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
