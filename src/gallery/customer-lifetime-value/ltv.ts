// Customer lifetime value with a constant monthly churn rate.
// Expected profit after t months is a geometric series: m · (1 − (1 − c)^t) / c,
// which levels off at LTV = m / c.

export function analyse(arpu: number, marginPct: number, churnPct: number, cac: number) {
  const monthlyProfit = arpu * (marginPct / 100);
  const churn = Math.min(Math.max(churnPct / 100, 0.0001), 0.9999);
  const ltv = monthlyProfit / churn;
  const ratio = cac > 0 ? ltv / cac : Infinity;

  // Months until expected profit covers the acquisition cost; null if it never does.
  const payback =
    cac <= 0 ? 0 : cac >= ltv ? null : Math.log(1 - (cac * churn) / monthlyProfit) / Math.log(1 - churn);
  // The common shortcut that assumes nobody churns.
  const simplePayback = monthlyProfit > 0 ? cac / monthlyProfit : null;

  // What each lever would need to be, on its own, to reach a 3 : 1 ratio.
  const target = {
    churnPct: (monthlyProfit / (3 * cac)) * 100,
    arpu: marginPct > 0 ? (3 * cac * churn) / (marginPct / 100) : null,
    cac: ltv / 3,
  };

  return { monthlyProfit, churn, ltv, ratio, payback, simplePayback, lifetime: 1 / churn, target };
}

export type Analysis = ReturnType<typeof analyse>;

export function earnedBy(month: number, monthlyProfit: number, churn: number) {
  return (monthlyProfit * (1 - (1 - churn) ** month)) / churn;
}

export function stillActive(month: number, churn: number) {
  return (1 - churn) ** month;
}
