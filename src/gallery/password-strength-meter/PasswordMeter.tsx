"use client";

import { useId, useState } from "react";
import { crackSeconds, estimate, formatDuration, type Estimate, type Finding } from "./strength";
import styles from "./PasswordMeter.module.css";

const LEVELS = [
  { label: "Very weak", tone: "critical" },
  { label: "Weak", tone: "serious" },
  { label: "Fair", tone: "warning" },
  { label: "Strong", tone: "good" },
  { label: "Very strong", tone: "good" },
] as const;

const SCENARIOS = [
  { key: "offline", label: "Leaked database", rate: 1e10, note: "10 billion guesses per second on a GPU rig" },
  { key: "online", label: "Login page", rate: 10, note: "10 guesses per second, rate-limited" },
] as const;

const FINDING_TEXT: Record<Finding["kind"], (text: string) => string> = {
  common: (t) => `Avoid “${t}”: it's on every attacker's list`,
  sequence: (t) => `Avoid sequences like “${t}”`,
  keyboard: (t) => `Avoid keyboard patterns like “${t}”`,
  repeat: (t) => `Avoid repeats like “${t}”`,
  year: (t) => `“${t}” looks like a year, which is easy to guess`,
};

const GENERATOR_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_+=?";

function generatePassword(length = 16) {
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  return Array.from(random, (n) => GENERATOR_CHARS[n % GENERATOR_CHARS.length]).join("");
}

function topTip(password: string, result: Estimate) {
  if (!password) return "Try a passphrase: four random words are easy to remember and hard to crack.";
  const common = result.findings.find((f) => f.kind === "common");
  if (common) return `Drop “${common.text}”. Adding numbers to a common word barely helps.`;
  if (password.length < 12) {
    const n = 12 - password.length;
    return `Add ${n} more character${n === 1 ? "" : "s"}. Length adds the most strength.`;
  }
  if (result.findings.length > 0) return `${FINDING_TEXT[result.findings[0].kind](result.findings[0].text)}.`;
  if (result.score >= 3) return "Nice. Save it in a password manager so you don't have to remember it.";
  return "Make it longer: every extra character multiplies the time to crack it.";
}

export default function PasswordMeter() {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]["key"]>("offline");
  const inputId = useId();

  const result = estimate(password);
  const empty = password.length === 0;
  const level = LEVELS[result.score];
  const rate = SCENARIOS.find((s) => s.key === scenario)!;
  const time = formatDuration(crackSeconds(result.bits, rate.rate));
  const timeLabel =
    time === "instantly" ? "Cracked instantly" : time.startsWith("longer") ? `Would take ${time}` : `Cracked in ~${time}`;
  const filled = empty ? 0 : Math.max(1, result.score);
  const pattern = result.findings[0];

  const checklist = [
    { ok: result.checks.length, text: "At least 12 characters" },
    { ok: result.checks.mixedCase, text: "Upper and lowercase letters" },
    { ok: result.checks.digit, text: "A number" },
    { ok: result.checks.symbol, text: "A symbol, like ! # or $" },
    {
      ok: !empty && !pattern,
      text: pattern ? FINDING_TEXT[pattern.kind](pattern.text) : "No common words or patterns",
    },
  ];

  return (
    <div className={styles.card} data-tone={empty ? "none" : level.tone}>
      <label htmlFor={inputId} className={styles.title}>
        Password strength
      </label>

      <div className={styles.inputWrap}>
        <input
          id={inputId}
          className={styles.input}
          type={visible ? "text" : "password"}
          value={password}
          placeholder="Type a password"
          autoComplete="new-password"
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="button"
          className={styles.eye}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {!visible && <path d="M4 20 20 4" />}
          </svg>
        </button>
      </div>

      <div className={styles.meter} aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => (
          <span key={segment} className={styles.segment} data-on={segment <= filled} />
        ))}
      </div>

      <div className={styles.verdict} aria-live="polite">
        <span className={styles.level}>
          {!empty && <span className={styles.dot} />}
          {empty ? "Enter a password" : level.label}
        </span>
        <span className={styles.time}>{empty ? "" : timeLabel}</span>
      </div>

      <div className={styles.scenarios} role="radiogroup" aria-label="Attack scenario">
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="radio"
            aria-checked={s.key === scenario}
            className={styles.scenario}
            onClick={() => setScenario(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className={styles.note}>{rate.note}</p>

      <p className={styles.tip}>{topTip(password, result)}</p>

      <ul className={styles.checklist}>
        {checklist.map((item) => (
          <li key={item.text} data-ok={item.ok}>
            <span className={styles.check} aria-hidden="true">
              {item.ok ? "✓" : ""}
            </span>
            <span className={styles.srOnly}>{item.ok ? "Done: " : "Missing: "}</span>
            {item.text}
          </li>
        ))}
      </ul>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.generate}
          onClick={() => {
            setPassword(generatePassword());
            setVisible(true);
          }}
        >
          Generate strong password
        </button>
        <span className={styles.privacy}>Checked on your device. Nothing is sent.</span>
      </div>
    </div>
  );
}
