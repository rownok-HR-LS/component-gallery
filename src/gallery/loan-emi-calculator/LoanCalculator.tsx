"use client";

import { useId, useMemo, useState, type CSSProperties } from "react";
import styles from "./LoanCalculator.module.css";

type Props = {
  currency?: string;
  locale?: string;
  defaultAmount?: number;
  /** Annual interest rate, in percent. */
  defaultRate?: number;
  defaultYears?: number;
};

type Segment = "principal" | "interest";

const RADIUS = 70;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Surface-colored gap between the two donut segments.
const GAP = 2;

/** Standard amortized monthly payment: P·r·(1+r)^n / ((1+r)^n − 1). */
export function monthlyPayment(principal: number, annualRate: number, months: number) {
  const r = annualRate / 12 / 100;
  if (r === 0) return principal / months;
  const growth = (1 + r) ** months;
  return (principal * r * growth) / (growth - 1);
}

export default function LoanCalculator({
  currency = "USD",
  locale = "en-US",
  defaultAmount = 300_000,
  defaultRate = 8.5,
  defaultYears = 20,
}: Props) {
  const [amount, setAmount] = useState(defaultAmount);
  const [rate, setRate] = useState(defaultRate);
  const [years, setYears] = useState(defaultYears);
  const [active, setActive] = useState<Segment | null>(null);

  const money = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format,
    [locale, currency],
  );

  const months = years * 12;
  const emi = monthlyPayment(amount, rate, months);
  const total = emi * months;
  const interest = total - amount;
  const principalShare = amount / total;

  const segments = [
    { key: "principal", label: "Principal", value: amount, share: principalShare, start: 0 },
    { key: "interest", label: "Interest", value: interest, share: 1 - principalShare, start: principalShare },
  ] as const;
  const focused = segments.find((s) => s.key === active);

  return (
    <div className={styles.card}>
      <header className={styles.hero}>
        <span className={styles.heroLabel}>Monthly payment</span>
        <span className={styles.heroValue}>
          {money(emi)}
          <span className={styles.heroUnit}>/mo</span>
        </span>
      </header>

      <div className={styles.fields}>
        <Slider label="Loan amount" value={amount} min={5_000} max={1_000_000} step={5_000} format={money} onChange={setAmount} />
        <Slider label="Interest rate" value={rate} min={0} max={20} step={0.1} format={(v) => `${v.toFixed(1)}%`} onChange={setRate} />
        <Slider label="Loan term" value={years} min={1} max={30} step={1} format={(v) => `${v} ${v === 1 ? "year" : "years"}`} onChange={setYears} />
      </div>

      <div className={styles.breakdown}>
        <div className={styles.donut}>
          <svg
            viewBox="0 0 180 180"
            role="img"
            aria-label={`Principal ${money(amount)}, interest ${money(interest)}, total ${money(total)}`}
          >
            <g transform="rotate(-90 90 90)">
              {segments.map((s) => {
                const length = Math.max(0, s.share * CIRCUMFERENCE - GAP);
                return (
                  <circle
                    key={s.key}
                    className={styles.arc}
                    data-dim={active !== null && active !== s.key}
                    cx="90"
                    cy="90"
                    r={RADIUS}
                    stroke={`var(--${s.key})`}
                    strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                    strokeDashoffset={-s.start * CIRCUMFERENCE}
                    onMouseEnter={() => setActive(s.key)}
                    onMouseLeave={() => setActive(null)}
                  />
                );
              })}
            </g>
          </svg>
          <div className={styles.center} aria-hidden="true">
            <span className={styles.centerLabel}>{focused ? focused.label : "Total payable"}</span>
            <span className={styles.centerValue}>{money(focused ? focused.value : total)}</span>
            {focused && <span className={styles.centerLabel}>{Math.round(focused.share * 100)}%</span>}
          </div>
        </div>

        <ul className={styles.legend}>
          {segments.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                className={styles.legendItem}
                data-dim={active !== null && active !== s.key}
                onMouseEnter={() => setActive(s.key)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(s.key)}
                onBlur={() => setActive(null)}
              >
                <span className={styles.swatch} style={{ background: `var(--${s.key})` }} />
                <span className={styles.legendText}>
                  <span className={styles.legendLabel}>
                    {s.label} · {Math.round(s.share * 100)}%
                  </span>
                  <span className={styles.legendValue}>{money(s.value)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
};

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;

  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <input
        id={id}
        type="range"
        className={styles.range}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--fill": `${fill}%` } as CSSProperties}
      />
    </div>
  );
}
