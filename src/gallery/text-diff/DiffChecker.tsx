"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { compare, type Part, type Row, type Side } from "./diff";
import { CHANGED, ORIGINAL } from "./samples";
import styles from "./DiffChecker.module.css";

type View = "split" | "unified";
type Item = { type: "row"; row: Row; index: number } | { type: "fold"; id: number; count: number };

const CONTEXT = 2; // unchanged lines kept around each change when folding
const MAX_LINES = 5000;

function Text({ side }: { side: Side }) {
  if (!side.parts) return <>{side.text || " "}</>;
  return (
    <>
      {side.parts.map((p: Part, i) =>
        p.changed ? (
          <mark key={i} className={styles.mark}>
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export default function DiffChecker() {
  const [original, setOriginal] = useState(ORIGINAL);
  const [changed, setChanged] = useState(CHANGED);
  const [view, setView] = useState<View>("split");
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [current, setCurrent] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const [copied, setCopied] = useState(false);

  const card = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Split view needs room; fall back to unified on narrow containers.
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    setNarrow(el.getBoundingClientRect().width < 620);
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 620));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const mode: View = narrow ? "unified" : view;

  const a = useDeferredValue(original);
  const b = useDeferredValue(changed);
  const tooLong = a.split("\n").length > MAX_LINES || b.split("\n").length > MAX_LINES;
  const result = useMemo(
    () => (tooLong ? null : compare(a, b, { ignoreCase, ignoreWhitespace })),
    [a, b, ignoreCase, ignoreWhitespace, tooLong],
  );

  useEffect(() => {
    setExpanded(new Set());
    setCurrent(0);
  }, [result]);

  // Collapse long runs of unchanged lines into clickable folds.
  const items = useMemo<Item[]>(() => {
    if (!result) return [];
    const { rows } = result;
    const keep = rows.map(() => !onlyChanges);
    if (onlyChanges) {
      rows.forEach((r, i) => {
        if (r.kind === "equal") return;
        for (let j = Math.max(0, i - CONTEXT); j <= Math.min(rows.length - 1, i + CONTEXT); j++) keep[j] = true;
      });
    }
    const out: Item[] = [];
    let i = 0;
    while (i < rows.length) {
      if (keep[i]) {
        out.push({ type: "row", row: rows[i], index: i });
        i++;
        continue;
      }
      const start = i;
      while (i < rows.length && !keep[i]) i++;
      if (expanded.has(start)) for (let j = start; j < i; j++) out.push({ type: "row", row: rows[j], index: j });
      else out.push({ type: "fold", id: start, count: i - start });
    }
    return out;
  }, [result, onlyChanges, expanded]);

  function goTo(n: number) {
    if (!result || !result.changes) return;
    const next = (n + result.changes) % result.changes;
    setCurrent(next);
    const target = panel.current?.querySelector<HTMLElement>(`[data-change="${next}"]`);
    if (target && panel.current) {
      panel.current.scrollTo({ top: target.offsetTop - panel.current.clientHeight / 3, behavior: "smooth" });
    }
  }

  function loadFile(e: ChangeEvent<HTMLInputElement>, set: (v: string) => void) {
    e.target.files?.[0]?.text().then(set);
    e.target.value = "";
  }
  function dropFile(e: DragEvent, set: (v: string) => void) {
    const file = e.dataTransfer.files[0];
    if (!file) return;
    e.preventDefault();
    file.text().then(set);
  }

  async function copyDiff() {
    if (!result) return;
    const lines: string[] = [];
    for (const r of result.rows) {
      if (r.kind === "equal") lines.push(`  ${r.left!.text}`);
      if (r.left && r.kind !== "equal") lines.push(`- ${r.left.text}`);
      if (r.right && r.kind !== "equal") lines.push(`+ ${r.right.text}`);
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const identical = result && result.changes === 0;
  const firstOfChange = (item: Item, idx: number) =>
    item.type === "row" &&
    item.row.change !== undefined &&
    !items.slice(0, idx).some((it) => it.type === "row" && it.row.change === item.row.change);

  const inputs = [
    { label: "Original", value: original, set: setOriginal },
    { label: "Changed", value: changed, set: setChanged },
  ];

  return (
    <div ref={card} className={styles.card}>
      <header className={styles.head}>
        <div>
          <h3 className={styles.title}>Text diff checker</h3>
          <p className={styles.subtitle}>See exactly what changed between two versions of a contract, policy or document.</p>
        </div>
        <button
          type="button"
          className={styles.chip}
          onClick={() => {
            setOriginal(changed);
            setChanged(original);
          }}
        >
          ⇄ Swap
        </button>
      </header>

      <div className={styles.inputs}>
        {inputs.map((input) => (
          <div key={input.label} className={styles.input}>
            <div className={styles.inputHead}>
              <span>{input.label}</span>
              <span className={styles.inputTools}>
                <label className={styles.link}>
                  Open file
                  <input type="file" accept=".txt,.md,.csv,.json,.html,.xml,text/*" onChange={(e) => loadFile(e, input.set)} />
                </label>
                <button type="button" className={styles.link} onClick={() => input.set("")}>
                  Clear
                </button>
              </span>
            </div>
            <textarea
              value={input.value}
              spellCheck={false}
              rows={8}
              placeholder={`Paste the ${input.label.toLowerCase()} text, or drop a file here`}
              onChange={(e) => input.set(e.target.value)}
              onDrop={(e) => dropFile(e, input.set)}
              aria-label={`${input.label} text`}
            />
          </div>
        ))}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.segmented} role="radiogroup" aria-label="View">
          {(["split", "unified"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={mode === v}
              disabled={v === "split" && narrow}
              title={v === "split" && narrow ? "Split view needs a wider screen" : undefined}
              onClick={() => setView(v)}
            >
              {v === "split" ? "Split" : "Unified"}
            </button>
          ))}
        </div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />
          Only changes
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} />
          Ignore case
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" checked={ignoreWhitespace} onChange={(e) => setIgnoreWhitespace(e.target.checked)} />
          Ignore spaces
        </label>
      </div>

      {result && (
        <div className={styles.summary}>
          <span className={styles.stat} data-tone="add">+{result.stats.added} added</span>
          <span className={styles.stat} data-tone="del">−{result.stats.removed} removed</span>
          <span className={styles.stat} data-tone="mod">~{result.stats.modified} changed</span>
          <span className={styles.similarity}>{Math.round(result.stats.similarity * 100)}% of lines unchanged</span>
          <span className={styles.spacer} />
          {result.changes > 0 && (
            <span className={styles.nav}>
              <button type="button" onClick={() => goTo(current - 1)} aria-label="Previous change">
                ‹
              </button>
              <span aria-live="polite">
                Change {current + 1} of {result.changes}
              </span>
              <button type="button" onClick={() => goTo(current + 1)} aria-label="Next change">
                ›
              </button>
            </span>
          )}
          <button type="button" className={styles.chip} onClick={copyDiff}>
            {copied ? "Copied ✓" : "Copy diff"}
          </button>
        </div>
      )}

      <div ref={panel} className={styles.result} data-view={mode}>
        {tooLong && <p className={styles.notice}>Texts over {MAX_LINES.toLocaleString()} lines aren&apos;t compared here.</p>}
        {!tooLong && !original && !changed && <p className={styles.notice}>Paste two versions above to compare them.</p>}
        {identical && (original || changed) && <p className={styles.notice}>No differences: the texts are identical.</p>}
        {!identical &&
          items.map((item, idx) => {
            if (item.type === "fold") {
              return (
                <button
                  key={`fold-${item.id}`}
                  type="button"
                  className={styles.fold}
                  onClick={() => setExpanded((s) => new Set(s).add(item.id))}
                >
                  ⋯ Show {item.count} unchanged line{item.count === 1 ? "" : "s"}
                </button>
              );
            }
            const { row } = item;
            const anchor = firstOfChange(item, idx) ? { "data-change": row.change } : {};
            const active = row.change === current && row.kind !== "equal";

            if (mode === "split") {
              return (
                <div key={item.index} className={styles.splitRow} data-kind={row.kind} data-active={active} {...anchor}>
                  <span className={styles.num}>{row.left?.num ?? ""}</span>
                  <span className={styles.cell} data-side="left" data-empty={!row.left}>
                    {row.left && <Text side={row.left} />}
                  </span>
                  <span className={styles.num}>{row.right?.num ?? ""}</span>
                  <span className={styles.cell} data-side="right" data-empty={!row.right}>
                    {row.right && <Text side={row.right} />}
                  </span>
                </div>
              );
            }

            const lines: { sign: string; side: Side; tone: string; a?: number; b?: number }[] = [];
            if (row.kind === "equal") lines.push({ sign: " ", side: row.left!, tone: "equal", a: row.left!.num, b: row.right!.num });
            else {
              if (row.left) lines.push({ sign: "−", side: row.left, tone: "del", a: row.left.num });
              if (row.right) lines.push({ sign: "+", side: row.right, tone: "add", b: row.right.num });
            }
            return (
              <div key={item.index} className={styles.unifiedGroup} data-active={active} {...anchor}>
                {lines.map((l, k) => (
                  <div key={k} className={styles.unifiedRow} data-tone={l.tone}>
                    <span className={styles.num}>{l.a ?? ""}</span>
                    <span className={styles.num}>{l.b ?? ""}</span>
                    <span className={styles.sign}>{l.sign}</span>
                    <span className={styles.cell}>
                      <Text side={l.side} />
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
      </div>
    </div>
  );
}
