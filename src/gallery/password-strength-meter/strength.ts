// A small, dependency-free strength estimator. It starts from brute-force entropy
// (length × log2 of the character pool) and discounts characters that sit inside
// predictable patterns: common passwords, sequences, keyboard rows, repeats and years.

export type Finding = { kind: "common" | "sequence" | "keyboard" | "repeat" | "year"; text: string };

export type Estimate = {
  bits: number;
  /** 0 very weak … 4 very strong */
  score: 0 | 1 | 2 | 3 | 4;
  findings: Finding[];
  checks: { length: boolean; mixedCase: boolean; digit: boolean; symbol: boolean };
};

const COMMON = [
  "password", "123456", "12345678", "qwerty", "abc123", "111111", "letmein", "welcome", "monkey",
  "dragon", "iloveyou", "admin", "login", "master", "sunshine", "princess", "football", "baseball",
  "shadow", "superman", "trustno1", "hello", "freedom", "whatever", "starwars", "michael", "charlie",
  "jessica", "qazwsx", "secret", "access", "computer", "internet", "love", "bangladesh", "dhaka",
];
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };
const SYMBOL = /[!-/:-@[-`{-~]/;

const isAlnum = (c: string) => /[a-z0-9]/.test(c);

/** Half-open [start, end) ranges where `step` holds between neighbours for at least `min` chars. */
function runs(s: string, step: (a: string, b: string) => boolean, min: number) {
  const found: [number, number][] = [];
  let start = 0;
  for (let i = 1; i <= s.length; i++) {
    if (i < s.length && step(s[i - 1], s[i])) continue;
    if (i - start >= min) found.push([start, i]);
    start = i;
  }
  return found;
}

function keyboardRuns(s: string) {
  const found: [number, number][] = [];
  for (let i = 0; i < s.length; i++) {
    for (let j = s.length; j >= i + 4; j--) {
      const chunk = s.slice(i, j);
      const reversed = [...chunk].reverse().join("");
      if (KEYBOARD_ROWS.some((row) => row.includes(chunk) || row.includes(reversed))) {
        found.push([i, j]);
        i = j - 1;
        break;
      }
    }
  }
  return found;
}

export function estimate(password: string): Estimate {
  const checks = {
    length: password.length >= 12,
    mixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
    digit: /\d/.test(password),
    symbol: SYMBOL.test(password) || /\s/.test(password),
  };

  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (SYMBOL.test(password)) pool += 33;
  if (/\s/.test(password)) pool += 1;
  if (/[^\x00-\x7F]/.test(password)) pool += 100;

  const full = pool > 1 ? Math.log2(pool) : 0;
  const cost = Array<number>(password.length).fill(full);
  const findings: Finding[] = [];

  const lower = password.toLowerCase();
  const plain = [...lower].map((c) => LEET[c] ?? c).join("");

  function mark(kind: Finding["kind"], [start, end]: [number, number], perChar: (offset: number) => number) {
    for (let i = start; i < end; i++) cost[i] = Math.min(cost[i], perChar(i - start));
    if (!findings.some((f) => f.kind === kind)) findings.push({ kind, text: password.slice(start, end) });
  }

  for (const word of COMMON) {
    for (const s of [lower, plain]) {
      const at = s.indexOf(word);
      // The whole word is worth about as much as picking it from the list.
      if (at >= 0) mark("common", [at, at + word.length], () => 6 / word.length);
    }
  }
  for (const m of lower.matchAll(/(?:19|20)\d\d/g)) mark("year", [m.index, m.index + 4], () => 7.6 / 4);

  const firstFull = (offset: number) => (offset === 0 ? full : 1);
  for (const r of runs(lower, (a, b) => a === b, 3)) mark("repeat", r, firstFull);
  for (const dir of [1, -1]) {
    const step = (a: string, b: string) => isAlnum(a) && isAlnum(b) && b.charCodeAt(0) - a.charCodeAt(0) === dir;
    for (const r of runs(lower, step, 3)) mark("sequence", r, firstFull);
  }
  for (const r of keyboardRuns(lower)) mark("keyboard", r, firstFull);

  const bits = cost.reduce((sum, c) => sum + c, 0);
  const score = bits < 25 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;

  return { bits, score, findings, checks };
}

/** Average time to guess: half the search space at the given guess rate. */
export function crackSeconds(bits: number, guessesPerSecond: number) {
  return 2 ** bits / 2 / guessesPerSecond;
}

const YEAR = 31_557_600;
const STEPS: [number, string, string][] = [
  [YEAR * 100, "century", "centuries"],
  [YEAR, "year", "years"],
  [YEAR / 12, "month", "months"],
  [86_400, "day", "days"],
  [3_600, "hour", "hours"],
  [60, "minute", "minutes"],
  [1, "second", "seconds"],
];
const compact = new Intl.NumberFormat("en", { notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 });

export function formatDuration(seconds: number) {
  if (seconds < 1) return "instantly";
  const years = seconds / YEAR;
  if (years > 13.8e9) return "longer than the universe has existed";
  if (years >= 10_000) return `${compact.format(years)} years`;
  for (const [size, one, many] of STEPS) {
    if (seconds >= size) {
      const n = Math.round(seconds / size);
      return `${n} ${n === 1 ? one : many}`;
    }
  }
  return "instantly";
}
