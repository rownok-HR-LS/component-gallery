export type Op = "equal" | "insert" | "delete";
export type Edit = { op: Op; ai: number; bi: number };

/**
 * Myers' O((N+M)·D) shortest-edit-script diff (the algorithm behind `git diff`).
 * Inputs are compared with ===, so callers map lines or words to keys first.
 * Common prefix and suffix are trimmed before the search to keep it fast.
 */
export function myers<K>(a: K[], b: K[]): Edit[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const out: Edit[] = [];
  for (let i = 0; i < start; i++) out.push({ op: "equal", ai: i, bi: i });
  for (const e of core(a.slice(start, endA), b.slice(start, endB))) {
    out.push({ op: e.op, ai: e.ai < 0 ? -1 : e.ai + start, bi: e.bi < 0 ? -1 : e.bi + start });
  }
  for (let j = 0; endA + j < a.length; j++) out.push({ op: "equal", ai: endA + j, bi: endB + j });
  return out;
}

function core<K>(a: K[], b: K[]): Edit[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];

  // v[k] = furthest x reached on diagonal k; snapshots (k in -d..d) are kept for backtracking.
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let D = 0;
  search: for (let d = 0; d <= max; d++) {
    trace.push(v.slice(off - d, off + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        D = d;
        break search;
      }
    }
  }

  const edits: Edit[] = [];
  let x = n;
  let y = m;
  for (let d = D; d > 0; d--) {
    const snap = trace[d];
    const at = (k: number) => snap[k + d];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) edits.push({ op: "equal", ai: --x, bi: --y });
    if (x === prevX) edits.push({ op: "insert", ai: -1, bi: --y });
    else edits.push({ op: "delete", ai: --x, bi: -1 });
  }
  while (x > 0 && y > 0) edits.push({ op: "equal", ai: --x, bi: --y });
  return edits.reverse();
}

export type Options = { ignoreCase: boolean; ignoreWhitespace: boolean };
export type Part = { text: string; changed: boolean };
export type Side = { num: number; text: string; parts?: Part[] };
export type Row = { kind: "equal" | "delete" | "insert" | "modify"; left?: Side; right?: Side; change?: number };
export type Result = {
  rows: Row[];
  changes: number;
  stats: { added: number; removed: number; modified: number; similarity: number };
};

// Words (letters incl. Bangla combining marks, digits), runs of whitespace, or single symbols.
const TOKEN = /\s+|[\p{L}\p{M}\p{N}_]+|[^\s\p{L}\p{M}\p{N}_]/gu;

function normalise(s: string, o: Options) {
  let t = o.ignoreWhitespace ? s.trim().replace(/\s+/g, " ") : s;
  if (o.ignoreCase) t = t.toLowerCase();
  return t;
}

function merge(parts: Part[]) {
  const out: Part[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && last.changed === p.changed) last.text += p.text;
    else out.push({ ...p });
  }
  return out;
}

/** Word-level diff of two lines, plus how similar they are (0–1, by characters kept). */
function wordDiff(a: string, b: string, o: Options) {
  const ta = a.match(TOKEN) ?? [];
  const tb = b.match(TOKEN) ?? [];
  const key = (t: string) => (o.ignoreWhitespace && /^\s+$/.test(t) ? " " : o.ignoreCase ? t.toLowerCase() : t);
  const left: Part[] = [];
  const right: Part[] = [];
  let same = 0;
  for (const e of myers(ta.map(key), tb.map(key))) {
    if (e.op === "equal") {
      left.push({ text: ta[e.ai], changed: false });
      right.push({ text: tb[e.bi], changed: false });
      if (!/^\s+$/.test(ta[e.ai])) same += ta[e.ai].length;
    } else if (e.op === "delete") left.push({ text: ta[e.ai], changed: true });
    else right.push({ text: tb[e.bi], changed: true });
  }
  // A lone space between two changes reads better highlighted with them.
  for (const parts of [left, right]) {
    for (let i = 1; i < parts.length - 1; i++) {
      if (!parts[i].changed && /^\s+$/.test(parts[i].text) && parts[i - 1].changed && parts[i + 1].changed) parts[i].changed = true;
    }
  }
  const chars = a.replace(/\s/g, "").length + b.replace(/\s/g, "").length;
  return { left: merge(left), right: merge(right), similarity: chars ? (2 * same) / chars : 1 };
}

export function compare(original: string, changed: string, o: Options): Result {
  const A = original.split(/\r?\n/);
  const B = changed.split(/\r?\n/);
  const ids = new Map<string, number>();
  const id = (s: string) => {
    const k = normalise(s, o);
    let v = ids.get(k);
    if (v === undefined) ids.set(k, (v = ids.size));
    return v;
  };

  const rows: Row[] = [];
  let removed: number[] = [];
  let added: number[] = [];
  let modified = 0;

  const insertRow = (i: number) => rows.push({ kind: "insert", right: { num: i + 1, text: B[i] } });

  // Within a block of removed + added lines, pair each removed line with the most similar added
  // line still ahead of it (so "6. Confidentiality" pairs with "7. Confidentiality", not with a new
  // clause heading). Paired lines become "modified" rows with word-level highlights.
  const flush = () => {
    let next = 0;
    for (const r of removed) {
      let best = -1;
      let bestDiff: ReturnType<typeof wordDiff> | null = null;
      for (let k = next; k < Math.min(added.length, next + 20); k++) {
        const w = wordDiff(A[r], B[added[k]], o);
        if (w.similarity >= 0.5 && (!bestDiff || w.similarity > bestDiff.similarity)) {
          best = k;
          bestDiff = w;
        }
      }
      if (best < 0 || !bestDiff) {
        rows.push({ kind: "delete", left: { num: r + 1, text: A[r] } });
        continue;
      }
      for (; next < best; next++) insertRow(added[next]);
      rows.push({
        kind: "modify",
        left: { num: r + 1, text: A[r], parts: bestDiff.left },
        right: { num: added[best] + 1, text: B[added[best]], parts: bestDiff.right },
      });
      modified++;
      next = best + 1;
    }
    for (; next < added.length; next++) insertRow(added[next]);
    removed = [];
    added = [];
  };

  for (const e of myers(A.map(id), B.map(id))) {
    if (e.op === "equal") {
      flush();
      rows.push({ kind: "equal", left: { num: e.ai + 1, text: A[e.ai] }, right: { num: e.bi + 1, text: B[e.bi] } });
    } else if (e.op === "delete") removed.push(e.ai);
    else added.push(e.bi);
  }
  flush();

  // Number each block of consecutive changed rows for navigation.
  let changes = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind === "equal") continue;
    if (i === 0 || rows[i - 1].kind === "equal") changes++;
    rows[i].change = changes - 1;
  }

  const equal = rows.filter((r) => r.kind === "equal").length;
  return {
    rows,
    changes,
    stats: {
      added: rows.filter((r) => r.kind === "insert").length,
      removed: rows.filter((r) => r.kind === "delete").length,
      modified,
      similarity: A.length + B.length ? (2 * equal) / (A.length + B.length) : 1,
    },
  };
}
