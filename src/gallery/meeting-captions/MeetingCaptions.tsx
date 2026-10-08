"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { analyse, DUE_RE, MONEY_RE, SAMPLE, type Item, type ItemKind, type Segment } from "./extract";
import styles from "./MeetingCaptions.module.css";

// Minimal typings for the Web Speech API (not in TypeScript's DOM lib).
type SpeechAlternative = { transcript: string };
type SpeechResult = { isFinal: boolean; 0: SpeechAlternative };
type SpeechEvent = { resultIndex: number; results: { length: number; [i: number]: SpeechResult } };
type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognizerCtor = new () => Recognizer;

const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#7c4dff", "#e2508a", "#0e9aa7"];
const LANGS = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-IN", label: "English (India)" },
  { code: "bn-BD", label: "বাংলা (Bangla)" },
];
const BARS = 18;
const TABS: { key: ItemKind; label: string }[] = [
  { key: "action", label: "Action items" },
  { key: "decision", label: "Decisions" },
  { key: "question", label: "Questions" },
];

const getRecognizer = (): RecognizerCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const shortDate = (d?: Date) => (d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Wraps dates/deadlines, money and the user's keywords in coloured marks. */
function Highlighted({ text, keywords }: { text: string; keywords: string[] }) {
  const parts: ReactNode[] = [];
  const kw = keywords.filter(Boolean).map(escapeRe).join("|");
  const re = new RegExp(`(${DUE_RE.source})|(${MONEY_RE.source})${kw ? `|\\b(${kw})\\b` : ""}`, "gi");
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    const kind = m[1] ? "due" : m[2] ? "money" : "keyword";
    parts.push(
      <mark key={i} className={styles.hl} data-kind={kind}>
        {m[0]}
      </mark>,
    );
    last = i + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export default function MeetingCaptions() {
  const [mode, setMode] = useState<"idle" | "live" | "demo">("idle");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [interim, setInterim] = useState("");
  const [speakers, setSpeakers] = useState(["Speaker 1", "Speaker 2"]);
  const [current, setCurrent] = useState(0);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [lang, setLang] = useState("en-US");
  const [keywords, setKeywords] = useState(["budget", "hotel"]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [tab, setTab] = useState<ItemKind>("action");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const [meetingDate] = useState(() => new Date());

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const interimRef = useRef("");
  interimRef.current = interim;
  const currentRef = useRef(current);
  currentRef.current = current;
  const recognizer = useRef<Recognizer | null>(null);
  const stream = useRef<{ stop: () => void } | null>(null);
  const demoRun = useRef(0);
  const nextId = useRef(1);
  // The sample plays faster than real speech, so its clock runs faster too (realistic timestamps and WPM).
  const clockRef = useRef({ base: 0, startedAt: 0, speed: 1 });
  const utteranceStart = useRef<number | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const now = () => {
    const c = clockRef.current;
    return c.base + (c.startedAt ? (Date.now() - c.startedAt) * c.speed : 0);
  };

  useEffect(() => setSupported(Boolean(getRecognizer())), []);

  // Session timer.
  useEffect(() => {
    if (mode === "idle") return;
    const t = setInterval(() => setElapsed(now()), 250);
    return () => clearInterval(t);
  }, [mode]);

  // Keep the transcript pinned to the newest line unless the reader has scrolled up.
  useEffect(() => {
    const el = transcript.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [segments, interim]);

  useEffect(
    () => () => {
      demoRun.current++;
      recognizer.current?.abort();
      stream.current?.stop();
    },
    [],
  );

  function startClock(speed = 1) {
    clockRef.current = { base: clockRef.current.base, startedAt: Date.now(), speed };
  }
  function stopClock() {
    clockRef.current = { base: now(), startedAt: 0, speed: 1 };
    setElapsed(clockRef.current.base);
  }

  function addSegment(text: string, speaker = currentRef.current) {
    const clean = text.trim();
    if (!clean) return;
    const end = now();
    const start = utteranceStart.current ?? Math.max(0, end - 1500);
    utteranceStart.current = null;
    setSegments((s) => [...s, { id: nextId.current++, speaker, text: clean[0].toUpperCase() + clean.slice(1), start, end }]);
  }

  function reset() {
    setSegments([]);
    setInterim("");
    setDone(new Set());
    setHidden(new Set());
    setElapsed(0);
    clockRef.current = { base: 0, startedAt: 0, speed: 1 };
    utteranceStart.current = null;
  }

  // ── Live captions from the microphone ─────────────────────────────────────────────
  async function startLive() {
    const Ctor = getRecognizer();
    if (!Ctor) return;
    stopAll();
    setError("");
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) addSegment(r[0].transcript);
        else pending += r[0].transcript;
      }
      if (pending && utteranceStart.current === null) utteranceStart.current = now();
      setInterim(pending);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone access was blocked. Allow it in the address bar and try again.");
        stopAll();
      } else if (e.error === "network") setError("The speech service couldn't be reached. Check your connection.");
    };
    // Chrome ends recognition after a pause; keep it going while live.
    rec.onend = () => {
      if (modeRef.current === "live") setTimeout(() => modeRef.current === "live" && rec.start(), 250);
    };
    recognizer.current = rec;
    setMode("live");
    modeRef.current = "live";
    startClock();
    try {
      rec.start();
    } catch {}
    startMeter();
  }

  async function startMeter() {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(media).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let raf = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        const rms = Math.min(1, Math.sqrt(sum / data.length) * 4);
        setLevels((l) => [...l.slice(1), Math.max(0.06, rms)]);
        raf = requestAnimationFrame(tick);
      };
      tick();
      stream.current = {
        stop: () => {
          cancelAnimationFrame(raf);
          media.getTracks().forEach((t) => t.stop());
          void ctx.close();
        },
      };
    } catch {
      // The meter is optional; recognition reports its own permission errors.
    }
  }

  // ── Scripted sample meeting ──────────────────────────────────────────────────────
  async function playSample() {
    stopAll();
    reset();
    setError("");
    setSpeakers(["Ayesha", "Imran", "Nusrat"]);
    setMode("demo");
    modeRef.current = "demo";
    startClock(2.5);
    const run = ++demoRun.current;
    for (const line of SAMPLE) {
      if (demoRun.current !== run) return;
      setCurrent(line.speaker);
      currentRef.current = line.speaker;
      utteranceStart.current = now();
      const words = line.text.split(" ");
      for (let i = 1; i <= words.length; i++) {
        if (demoRun.current !== run) return;
        setInterim(words.slice(0, i).join(" "));
        setLevels((l) => [...l.slice(1), 0.25 + Math.random() * 0.6]);
        await sleep(95 + Math.random() * 60);
      }
      addSegment(line.text, line.speaker);
      setInterim("");
      for (let i = 0; i < 6; i++) {
        setLevels((l) => [...l.slice(1), 0.06 + Math.random() * 0.06]);
        await sleep(90);
      }
    }
    if (demoRun.current === run) stopAll();
  }

  // Reads refs, not state: it is also called from the sample's async loop, whose closure is stale.
  function stopAll() {
    const was = modeRef.current;
    demoRun.current++;
    const rec = recognizer.current;
    recognizer.current = null;
    modeRef.current = "idle";
    rec?.stop();
    stream.current?.stop();
    stream.current = null;
    if (was === "live" && interimRef.current) addSegment(interimRef.current);
    interimRef.current = "";
    setInterim("");
    if (was !== "idle") stopClock();
    setMode("idle");
    setLevels(Array(BARS).fill(0.08));
  }

  // ── Derived notes ────────────────────────────────────────────────────────────────
  const items = useMemo(() => analyse(segments, speakers, meetingDate).filter((i) => !hidden.has(i.id)), [segments, speakers, meetingDate, hidden]);
  const byKind = (k: ItemKind) => items.filter((i) => i.kind === k);
  const actionSegments = new Set(byKind("action").map((i) => i.segmentId));
  const words = segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
  const minutes = Math.max(elapsed, 1) / 60000;
  const talk = speakers.map((_, i) => segments.filter((s) => s.speaker === i).reduce((n, s) => n + s.text.split(/\s+/).length, 0));
  const talkTotal = Math.max(1, talk.reduce((a, b) => a + b, 0));

  function jumpTo(segmentId: number) {
    const el = transcript.current?.querySelector<HTMLElement>(`[data-seg="${segmentId}"]`);
    if (!el || !transcript.current) return;
    stick.current = false;
    transcript.current.scrollTo({ top: el.offsetTop - 40, behavior: "smooth" });
    setFlash(segmentId);
    setTimeout(() => setFlash(null), 1400);
  }

  function notes() {
    const date = meetingDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const lines = [`# Meeting notes, ${date}`, "", `Duration ${clock(elapsed)} · ${speakers.length} speakers · ${words} words`, ""];
    const section = (title: string, list: Item[], fmt: (i: Item) => string) => {
      if (!list.length) return;
      lines.push(`## ${title}`, ...list.map(fmt), "");
    };
    section("Action items", byKind("action"), (i) => {
      const meta = [i.owner ?? "Unassigned", i.dueDate ? `due ${shortDate(i.dueDate)}` : ""].filter(Boolean).join(" · ");
      return `- [${done.has(i.id) ? "x" : " "}] ${i.text} (${meta})`;
    });
    section("Decisions", byKind("decision"), (i) => `- ${i.text}`);
    section("Open questions", byKind("question"), (i) => `- ${i.text}`);
    return lines.join("\n");
  }

  const transcriptText = () => segments.map((s) => `[${clock(s.start)}] ${speakers[s.speaker] ?? "Speaker"}: ${s.text}`).join("\n");

  async function copyNotes() {
    await navigator.clipboard.writeText(notes());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    const n = Number(e.key);
    if (n >= 1 && n <= speakers.length) {
      setCurrent(n - 1);
      e.preventDefault();
    }
  }

  function addKeyword() {
    const k = keywordDraft.trim().toLowerCase();
    if (k && !keywords.includes(k)) setKeywords([...keywords, k]);
    setKeywordDraft("");
  }

  const status = mode === "live" ? "Live" : mode === "demo" ? "Sample meeting" : segments.length ? "Stopped" : "Ready";
  const list = byKind(tab);

  return (
    <div className={styles.card} onKeyDown={onKeyDown}>
      <header className={styles.head}>
        <div>
          <h3 className={styles.title}>Live meeting captions</h3>
          <p className={styles.subtitle}>Captions as people talk, with action items, decisions and questions pulled out automatically.</p>
        </div>
        <div className={styles.status} data-mode={mode}>
          <span className={styles.dot} />
          {status}
          <span className={styles.timer}>{clock(elapsed)}</span>
          <span className={styles.meter} aria-hidden="true">
            {levels.map((l, i) => (
              <span key={i} style={{ transform: `scaleY(${l})` }} />
            ))}
          </span>
        </div>
      </header>

      <div className={styles.controls}>
        {mode === "idle" ? (
          <>
            <button type="button" className={styles.primary} onClick={startLive} disabled={!supported}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
              Start captions
            </button>
            <button type="button" className={styles.secondary} onClick={playSample}>
              ▶ Play sample meeting
            </button>
          </>
        ) : (
          <button type="button" className={styles.stop} onClick={stopAll}>
            ■ Stop
          </button>
        )}
        <select className={styles.select} value={lang} onChange={(e) => setLang(e.target.value)} disabled={mode !== "idle"} aria-label="Spoken language">
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        {segments.length > 0 && mode === "idle" && (
          <button type="button" className={styles.ghost} onClick={reset}>
            Clear
          </button>
        )}
      </div>

      {!supported && <p className={styles.notice}>Live captions need Chrome or Edge on desktop or Android. You can still play the sample meeting.</p>}
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.speakers} aria-label="Speakers (press 1–6 to switch)">
        <span className={styles.label}>Now speaking</span>
        {speakers.map((name, i) =>
          renaming === i ? (
            <input
              key={i}
              autoFocus
              className={styles.rename}
              defaultValue={name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v) setSpeakers((s) => s.map((x, j) => (j === i ? v : x)));
                setRenaming(null);
              }}
              onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <button
              key={i}
              type="button"
              className={styles.speaker}
              aria-pressed={current === i}
              style={{ ["--c" as string]: COLORS[i % COLORS.length] }}
              onClick={() => setCurrent(i)}
              onDoubleClick={() => setRenaming(i)}
              title="Click to set who is speaking · double-click to rename"
            >
              <span className={styles.swatch} />
              {name}
              <kbd>{i + 1}</kbd>
            </button>
          ),
        )}
        {speakers.length < COLORS.length && (
          <button type="button" className={styles.addSpeaker} onClick={() => setSpeakers((s) => [...s, `Speaker ${s.length + 1}`])} aria-label="Add speaker">
            +
          </button>
        )}
      </div>

      <div className={styles.body}>
        <section className={styles.transcriptBox} aria-label="Transcript">
          <div
            ref={transcript}
            className={styles.transcript}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            }}
          >
            {segments.length === 0 && !interim && (
              <p className={styles.empty}>
                Press <strong>Start captions</strong> and talk, or play the sample meeting to see captions and notes appear.
              </p>
            )}
            {segments.map((s) => (
              <div key={s.id} data-seg={s.id} className={styles.line} data-flash={flash === s.id} style={{ ["--c" as string]: COLORS[s.speaker % COLORS.length] }}>
                <div className={styles.lineHead}>
                  <span className={styles.who}>{speakers[s.speaker] ?? "Speaker"}</span>
                  <span className={styles.time}>{clock(s.start)}</span>
                  {actionSegments.has(s.id) && <span className={styles.badge}>Action</span>}
                </div>
                <p>
                  <Highlighted text={s.text} keywords={keywords} />
                </p>
              </div>
            ))}
          </div>
          <div className={styles.caption} data-active={Boolean(interim)} style={{ ["--c" as string]: COLORS[current % COLORS.length] }} aria-live="off">
            <span className={styles.captionWho}>{speakers[current]}</span>
            <span className={styles.captionText}>{interim || (mode !== "idle" ? "Listening…" : "Captions appear here")}</span>
          </div>
        </section>

        <aside className={styles.insights} aria-label="Meeting notes">
          <div className={styles.tabs} role="tablist">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label}
                <span className={styles.count}>{byKind(t.key).length}</span>
              </button>
            ))}
          </div>

          <ul className={styles.items} aria-live="polite">
            {list.length === 0 && <li className={styles.none}>Nothing yet. They appear as the meeting goes on.</li>}
            {list.map((it) => (
              <li key={it.id} className={styles.item} data-kind={it.kind} data-done={done.has(it.id)}>
                {it.kind === "action" ? (
                  <input
                    type="checkbox"
                    checked={done.has(it.id)}
                    aria-label={`Done: ${it.text}`}
                    onChange={() =>
                      setDone((d) => {
                        const n = new Set(d);
                        if (n.has(it.id)) n.delete(it.id);
                        else n.add(it.id);
                        return n;
                      })
                    }
                  />
                ) : (
                  <span className={styles.kindIcon} aria-hidden="true">
                    {it.kind === "decision" ? "✓" : "?"}
                  </span>
                )}
                <div className={styles.itemBody}>
                  <span className={styles.itemText}>{it.text}</span>
                  <span className={styles.meta}>
                    {it.kind === "action" && <span className={styles.owner} data-unassigned={!it.owner}>{it.owner ?? "Unassigned"}</span>}
                    {it.dueDate && <span className={styles.due}>Due {shortDate(it.dueDate)}</span>}
                    <button type="button" className={styles.at} onClick={() => jumpTo(it.segmentId)}>
                      at {clock(it.at)}
                    </button>
                  </span>
                </div>
                <button type="button" className={styles.remove} aria-label="Dismiss" onClick={() => setHidden((h) => new Set(h).add(it.id))}>
                  ×
                </button>
              </li>
            ))}
          </ul>

          <div className={styles.stats}>
            <div>
              <strong>{clock(elapsed)}</strong>
              <span>duration</span>
            </div>
            <div>
              <strong>{words}</strong>
              <span>words</span>
            </div>
            <div>
              <strong>{segments.length ? Math.round(words / minutes) : 0}</strong>
              <span>words/min</span>
            </div>
          </div>
          <div className={styles.talk} aria-label="Talk time">
            {speakers.map((name, i) => (
              <div key={i} className={styles.talkRow}>
                <span>{name}</span>
                <span className={styles.talkBar}>
                  <span style={{ width: `${(talk[i] / talkTotal) * 100}%`, background: COLORS[i % COLORS.length] }} />
                </span>
                <span className={styles.talkPct}>{Math.round((talk[i] / talkTotal) * 100)}%</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <footer className={styles.footer}>
        <div className={styles.keywords}>
          <span className={styles.label}>Highlight</span>
          {keywords.map((k) => (
            <button key={k} type="button" className={styles.keyword} onClick={() => setKeywords(keywords.filter((x) => x !== k))} aria-label={`Stop highlighting ${k}`}>
              {k} ×
            </button>
          ))}
          <input
            className={styles.keywordInput}
            value={keywordDraft}
            placeholder="add word"
            onChange={(e) => setKeywordDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addKeyword()}
            onBlur={addKeyword}
            aria-label="Add a word to highlight"
          />
        </div>
        <div className={styles.exports}>
          <button type="button" className={styles.ghost} onClick={copyNotes} disabled={!segments.length}>
            {copied ? "Copied ✓" : "Copy notes"}
          </button>
          <button type="button" className={styles.ghost} onClick={() => download(transcriptText(), "transcript.txt", "text/plain")} disabled={!segments.length}>
            Transcript .txt
          </button>
          <button type="button" className={styles.ghost} onClick={() => download(notes(), "meeting-notes.md", "text/markdown")} disabled={!segments.length}>
            Notes .md
          </button>
        </div>
      </footer>
      <p className={styles.privacy}>
        Recognition uses your browser&apos;s speech service (in Chrome, audio is processed by Google). This page stores nothing. Notes are extracted on your device.
      </p>
    </div>
  );
}
