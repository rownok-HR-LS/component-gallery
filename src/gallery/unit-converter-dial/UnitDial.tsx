"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import styles from "./UnitDial.module.css";

type Category = {
  key: string;
  label: string;
  units: [string, string];
  names: [string, string];
  toSecond: (value: number) => number;
  toFirst: (value: number) => number;
  hint: string;
};

const CATEGORIES: Category[] = [
  {
    key: "distance",
    label: "Distance",
    units: ["km", "mi"],
    names: ["Kilometres", "Miles"],
    toSecond: (v) => v / 1.609344,
    toFirst: (v) => v * 1.609344,
    hint: "1 km = 0.6214 mi",
  },
  {
    key: "temperature",
    label: "Temp",
    units: ["°C", "°F"],
    names: ["Celsius", "Fahrenheit"],
    toSecond: (v) => (v * 9) / 5 + 32,
    toFirst: (v) => ((v - 32) * 5) / 9,
    hint: "°F = °C × 9⁄5 + 32",
  },
  {
    key: "weight",
    label: "Weight",
    units: ["kg", "lb"],
    names: ["Kilograms", "Pounds"],
    toSecond: (v) => v / 0.45359237,
    toFirst: (v) => v * 0.45359237,
    hint: "1 kg = 2.2046 lb",
  },
];

// Knob angle for each category, in degrees clockwise from straight up.
const DETENTS = [-60, 0, 60];
const MAX_TURN = 80;
const TICKS = Array.from({ length: 17 }, (_, i) => -80 + i * 10);

// Dial layout in a 260×196 box; converted to percentages so the dial can shrink.
const BOX = { w: 260, h: 196 };
const CENTER = { x: 130, y: 124 };
const LABEL_RADIUS = 112;

const NUMBER = /^-?\d*\.?\d*$/;
const KEY_STEPS: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

function polar(angle: number, radius: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: CENTER.x + radius * Math.sin(rad), y: CENTER.y - radius * Math.cos(rad) };
}

function nearestDetent(angle: number) {
  return DETENTS.reduce((best, d, i) => (Math.abs(angle - d) < Math.abs(angle - DETENTS[best]) ? i : best), 0);
}

// Pointer angle around the element's center: 0 = up, clockwise positive.
function pointerAngle(e: PointerEvent, el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return (Math.atan2(e.clientX - (r.left + r.width / 2), r.top + r.height / 2 - e.clientY) * 180) / Math.PI;
}

function format(value: number) {
  return String(Math.round(value * 1e4) / 1e4);
}

export default function UnitDial() {
  const [index, setIndex] = useState(0);
  const [angle, setAngle] = useState(DETENTS[0]);
  const [dragging, setDragging] = useState(false);
  const [entry, setEntry] = useState<{ side: 0 | 1; text: string }>({ side: 0, text: "10" });
  const lastPointer = useRef(0);

  const category = CATEGORIES[index];

  function select(i: number) {
    const next = Math.max(0, Math.min(CATEGORIES.length - 1, i));
    setIndex(next);
    setAngle(DETENTS[next]);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastPointer.current = pointerAngle(e, e.currentTarget);
    setDragging(true);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const now = pointerAngle(e, e.currentTarget);
    // Shortest way round, so crossing the bottom of the knob doesn't jump 360°.
    const delta = ((now - lastPointer.current + 540) % 360) - 180;
    lastPointer.current = now;
    const next = Math.max(-MAX_TURN, Math.min(MAX_TURN, angle + delta));
    setAngle(next);
    setIndex(nearestDetent(next));
  }

  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    select(nearestDetent(angle));
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = KEY_STEPS[e.key];
    if (step) select(index + step);
    else if (e.key === "Home") select(0);
    else if (e.key === "End") select(CATEGORIES.length - 1);
    else return;
    e.preventDefault();
  }

  const parsed = Number(entry.text);
  const hasValue = entry.text !== "" && !Number.isNaN(parsed);
  const convert = entry.side === 0 ? category.toSecond : category.toFirst;
  const converted = hasValue ? format(convert(parsed)) : "";
  const values = entry.side === 0 ? [entry.text, converted] : [converted, entry.text];

  const pct = (x: number, y: number) => ({ left: `${(x / BOX.w) * 100}%`, top: `${(y / BOX.h) * 100}%` });

  return (
    <div className={styles.card} style={{ "--accent": `var(--${category.key})` } as CSSProperties}>
      <div className={styles.head}>
        <span className={styles.title}>Unit converter</span>
        <span className={styles.tip}>Spin the dial</span>
      </div>

      <div className={styles.dial}>
        <svg className={styles.ticks} viewBox={`0 0 ${BOX.w} ${BOX.h}`} aria-hidden="true">
          {TICKS.map((t) => {
            const major = DETENTS.includes(t);
            const from = polar(t, major ? 66 : 69);
            const to = polar(t, major ? 78 : 74);
            const cls = t === DETENTS[index] ? styles.tickActive : major ? styles.tickMajor : styles.tick;
            return <line key={t} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={cls} />;
          })}
        </svg>

        {CATEGORIES.map((c, i) => {
          const p = polar(DETENTS[i], LABEL_RADIUS);
          return (
            <button
              key={c.key}
              type="button"
              className={styles.option}
              data-active={i === index}
              aria-pressed={i === index}
              style={pct(p.x, p.y)}
              onClick={() => select(i)}
            >
              <span className={styles.optionName}>{c.label}</span>
              <span className={styles.optionUnits}>
                {c.units[0]} · {c.units[1]}
              </span>
            </button>
          );
        })}

        <div
          className={styles.knob}
          role="slider"
          tabIndex={0}
          aria-label="Unit type"
          aria-valuemin={0}
          aria-valuemax={CATEGORIES.length - 1}
          aria-valuenow={index}
          aria-valuetext={category.label}
          data-dragging={dragging}
          style={{ transform: `rotate(${angle}deg)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <span className={styles.indicator} />
        </div>
        <div className={styles.cap} aria-hidden="true">
          {category.units[0]} ⇄ {category.units[1]}
        </div>
      </div>

      <div className={styles.fields}>
        {([0, 1] as const).map((side) => (
          <div key={side} className={styles.fieldGroup}>
            {side === 1 && <span className={styles.equals}>=</span>}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{category.names[side]}</span>
              <span className={styles.inputWrap}>
                <input
                  className={styles.input}
                  inputMode="decimal"
                  autoComplete="off"
                  value={values[side]}
                  onChange={(e) => {
                    if (NUMBER.test(e.target.value)) setEntry({ side, text: e.target.value });
                  }}
                />
                <span className={styles.suffix}>{category.units[side]}</span>
              </span>
            </label>
          </div>
        ))}
      </div>

      <p className={styles.hint}>{category.hint}</p>
    </div>
  );
}
