"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { earnedBy, stillActive, type Analysis } from "./ltv";
import styles from "./LtvCalculator.module.css";

type Props = {
  analysis: Analysis;
  cac: number;
  money: (value: number) => string;
  compactMoney: (value: number) => string;
};

const HEIGHT = 210;
const M = { top: 20, right: 14, bottom: 26, left: 46 };
const MONTH_STEPS = [1, 2, 3, 6, 12, 24, 36, 60];

function niceStep(raw: number) {
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export default function ProfitChart({ analysis, cac, money, compactMoney }: Props) {
  const [ref, width] = useWidth(500);
  const [hover, setHover] = useState<number | null>(null);
  const { monthlyProfit, churn, ltv, payback } = analysis;

  // Three average lifetimes covers ~95% of the profit a customer will ever bring in.
  let horizon = clamp(Math.round(3 / churn), 12, 120);
  if (payback !== null) horizon = clamp(Math.max(horizon, Math.ceil(payback * 1.25)), 12, 120);

  const innerW = Math.max(1, width - M.left - M.right);
  const innerH = HEIGHT - M.top - M.bottom;
  const yStep = niceStep(Math.max(ltv, cac, 1) / 4);
  const yMax = Math.ceil((Math.max(ltv, cac, 1) * 1.08) / yStep) * yStep;
  const x = (month: number) => M.left + (month / horizon) * innerW;
  const y = (value: number) => M.top + innerH - (value / yMax) * innerH;

  const points = Array.from({ length: horizon + 1 }, (_, m) => `${x(m).toFixed(1)},${y(earnedBy(m, monthlyProfit, churn)).toFixed(1)}`);
  const line = `M${points.join("L")}`;
  const area = `${line}L${x(horizon)},${y(0)}L${x(0)},${y(0)}Z`;

  const yTicks = Array.from({ length: Math.round(yMax / yStep) + 1 }, (_, i) => i * yStep);
  const xStep = MONTH_STEPS.find((s) => s >= horizon / 6) ?? 60;
  const xTicks = Array.from({ length: Math.floor(horizon / xStep) + 1 }, (_, i) => i * xStep);

  const cacY = y(cac);
  const ltvY = y(ltv);
  const labelsCollide = Math.abs(cacY - ltvY) < 16;
  const breakEven = payback !== null && payback > 0 && payback <= horizon ? payback : null;

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    setHover(clamp(Math.round(((px - M.left) / innerW) * horizon), 0, horizon));
  }

  const hovered = hover === null ? null : { month: hover, value: earnedBy(hover, monthlyProfit, churn) };

  return (
    <div ref={ref} className={styles.chart}>
      {/* Percentage width keeps the SVG from forcing its container wider before it is measured. */}
      <svg
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={`Expected profit per customer rises to ${money(ltv)}; acquisition cost is ${money(cac)}${
          breakEven ? `; break-even around month ${Math.ceil(breakEven)}` : "; it never breaks even"
        }.`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? styles.baseline : styles.grid} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className={styles.axisLabel}>
              {compactMoney(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={t} x={x(t)} y={HEIGHT - 8} textAnchor={i === 0 ? "start" : "middle"} className={styles.axisLabel}>
            {i === xTicks.length - 1 ? `${t} mo` : t}
          </text>
        ))}

        <path d={area} className={styles.area} />
        <path d={line} className={styles.line} />

        <line x1={M.left} x2={width - M.right} y1={ltvY} y2={ltvY} className={styles.refLtv} />
        <text x={width - M.right} y={ltvY - 6} textAnchor="end" className={styles.refLabel}>
          LTV {money(ltv)}
        </text>
        <line x1={M.left} x2={width - M.right} y1={cacY} y2={cacY} className={styles.refCac} />
        <text x={width - M.right} y={labelsCollide ? cacY + 14 : cacY - 6} textAnchor="end" className={styles.refLabel}>
          Cost to acquire {money(cac)}
        </text>

        {breakEven !== null && (
          <g>
            <circle cx={x(breakEven)} cy={cacY} r={5} className={styles.marker} />
            <text
              x={x(breakEven) + (x(breakEven) > width / 2 ? -10 : 10)}
              y={cacY + 16}
              textAnchor={x(breakEven) > width / 2 ? "end" : "start"}
              className={styles.markerLabel}
            >
              Break-even ≈ month {Math.ceil(breakEven)}
            </text>
          </g>
        )}

        {hovered && (
          <g pointerEvents="none">
            <line x1={x(hovered.month)} x2={x(hovered.month)} y1={M.top} y2={y(0)} className={styles.crosshair} />
            <circle cx={x(hovered.month)} cy={y(hovered.value)} r={4.5} className={styles.marker} />
          </g>
        )}
      </svg>

      {hovered && (
        <div
          className={styles.tooltip}
          style={{ left: clamp(x(hovered.month), 80, width - 80), top: y(hovered.value) }}
          aria-hidden="true"
        >
          <strong>Month {hovered.month}</strong>
          <span>{money(hovered.value)} profit so far</span>
          <span>{Math.round(stillActive(hovered.month, churn) * 100)}% of customers still active</span>
        </div>
      )}
    </div>
  );
}
