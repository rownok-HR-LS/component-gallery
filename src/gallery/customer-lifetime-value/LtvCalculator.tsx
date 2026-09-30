"use client";

import { useId, useMemo, useState } from "react";
import { analyse, type Analysis } from "./ltv";
import ProfitChart from "./ProfitChart";
import styles from "./LtvCalculator.module.css";

type Props = {
  currency?: string;
  locale?: string;
};

type FieldKey = "arpu" | "margin" | "churn" | "cac";

const NUMBER = /^\d*\.?\d*$/;

function verdict(ratio: number) {
  if (ratio < 1) return { tone: "critical", icon: "✕", label: "Losing money", text: "Each customer costs more to win than they will ever earn." };
  if (ratio < 3) return { tone: "warning", icon: "!", label: "Thin", text: "Profitable, but with little room for mistakes." };
  if (ratio <= 5) return { tone: "good", icon: "✓", label: "Healthy", text: "Right in the usual 3–5 : 1 target range." };
  return { tone: "good", icon: "✓", label: "Room to grow", text: "Very profitable per customer." };
}

function advice(a: Analysis, cac: number, money: (v: number) => string, moneyExact: (v: number) => string) {
  if (a.ratio >= 3 && a.ratio <= 5) return "Keep churn and acquisition cost where they are; this is a sustainable balance.";
  if (a.ratio > 5) return `You earn ${a.ratio.toFixed(1)}× what each customer costs, so there is room to spend more on marketing and grow faster.`;
  const levers = [
    `lower monthly churn to ${a.target.churnPct.toFixed(1)}%`,
    a.target.arpu !== null ? `raise revenue per customer to ${moneyExact(a.target.arpu)}/mo` : null,
    `cut acquisition cost to ${money(a.target.cac)}`,
  ].filter(Boolean);
  const lead = cac > 0 ? `Every ${money(1)} spent winning a customer returns ${moneyExact(a.ratio)}.` : "";
  return `${lead} To reach a healthy 3 : 1, ${levers.join(", or ")}.`.trim();
}

export default function LtvCalculator({ currency = "USD", locale = "en-US" }: Props) {
  const [values, setValues] = useState<Record<FieldKey, string>>({ arpu: "50", margin: "70", churn: "3", cac: "450" });
  const id = useId();

  const { money, moneyExact, compactMoney, symbol } = useMemo(() => {
    const whole = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 });
    const exact = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const compact = new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
    return {
      money: whole.format,
      moneyExact: exact.format,
      compactMoney: compact.format,
      symbol: whole.formatToParts(0).find((p) => p.type === "currency")?.value ?? "",
    };
  }, [locale, currency]);

  const num = (key: FieldKey) => Number(values[key]) || 0;
  const cac = num("cac");
  const a = analyse(num("arpu"), Math.min(num("margin"), 100), Math.min(num("churn"), 100), cac);
  const v = verdict(a.ratio);

  const fields: { key: FieldKey; label: string; prefix?: string; suffix?: string }[] = [
    { key: "arpu", label: "Revenue per customer", prefix: symbol, suffix: "/mo" },
    { key: "margin", label: "Gross margin", suffix: "%" },
    { key: "churn", label: "Customers lost per month", suffix: "%" },
    { key: "cac", label: "Cost to win a customer", prefix: symbol },
  ];

  return (
    <div className={styles.card} data-tone={v.tone}>
      <header className={styles.head}>
        <h3 className={styles.title}>Customer lifetime value</h3>
        <p className={styles.subtitle}>Is each customer worth what you pay to win them?</p>
      </header>

      <div className={styles.fields}>
        {fields.map((f) => (
          <div key={f.key} className={styles.field}>
            <label htmlFor={`${id}-${f.key}`}>{f.label}</label>
            <div className={styles.inputWrap}>
              {f.prefix && <span className={styles.prefix}>{f.prefix}</span>}
              <input
                id={`${id}-${f.key}`}
                className={styles.input}
                data-prefix={Boolean(f.prefix)}
                inputMode="decimal"
                autoComplete="off"
                value={values[f.key]}
                onChange={(e) => {
                  if (NUMBER.test(e.target.value)) setValues((prev) => ({ ...prev, [f.key]: e.target.value }));
                }}
              />
              {f.suffix && <span className={styles.suffix}>{f.suffix}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Lifetime value</span>
          <span className={styles.statValue}>{money(a.ltv)}</span>
          <span className={styles.statSub}>over a {Math.round(a.lifetime)}-month average lifetime</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Value : cost</span>
          <span className={styles.statValue}>{Number.isFinite(a.ratio) ? `${a.ratio.toFixed(1)} : 1` : "∞"}</span>
          <span className={styles.badge}>
            <span className={styles.badgeIcon} aria-hidden="true">
              {v.icon}
            </span>
            {v.label}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Pays back its cost</span>
          <span className={styles.statValue}>{a.payback === null ? "Never" : `${a.payback.toFixed(1)} mo`}</span>
          <span className={styles.statSub}>
            {a.simplePayback === null ? "No profit per month" : `${a.simplePayback.toFixed(1)} mo if nobody left`}
          </span>
        </div>
      </div>

      <ProfitChart analysis={a} cac={cac} money={money} compactMoney={compactMoney} />

      <p className={styles.advice}>
        <strong>{v.text}</strong> {advice(a, cac, money, moneyExact)}
      </p>
    </div>
  );
}
