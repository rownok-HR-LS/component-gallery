"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import MorphButton, { type Status } from "./MorphButton";
import styles from "./Demo.module.css";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Outcome = "success" | "error";

// A newsletter form wired to the button. The switch below decides whether the fake request succeeds.
export default function Demo() {
  const [status, setStatus] = useState<Status>("idle");
  const [outcome, setOutcome] = useState<Outcome>("success");
  const [message, setMessage] = useState<{ tone: Outcome; text: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status !== "idle") return;
    setMessage(null);
    setStatus("loading");
    await wait(1500);
    if (!mounted.current) return;
    setStatus(outcome);
    setMessage(
      outcome === "success"
        ? { tone: "success", text: "You're in! Check your inbox to confirm." }
        : { tone: "error", text: "Couldn't subscribe. Please try again." },
    );
    await wait(outcome === "success" ? 2000 : 1500);
    if (!mounted.current) return;
    setStatus("idle");
  }

  return (
    <div className={styles.demo}>
      <form className={styles.card} onSubmit={onSubmit}>
        <div className={styles.badge} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <path d="m3.5 6.5 8.5 6 8.5-6" />
          </svg>
        </div>
        <h3 className={styles.title}>Get the weekly digest</h3>
        <p className={styles.subtitle}>Hand-picked UI ideas every Friday. No spam, unsubscribe anytime.</p>

        <label className={styles.field}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
          </svg>
          <input type="email" placeholder="you@example.com" aria-label="Email address" autoComplete="email" />
        </label>

        <MorphButton
          type="submit"
          block
          status={status}
          label={message?.tone === "error" && status === "idle" ? "Try again" : "Subscribe"}
          messages={{ loading: "Subscribing…", success: "Subscribed!", error: "Something went wrong." }}
        />

        <p className={styles.message} data-tone={message?.tone} aria-live="polite">
          {message?.text ?? ""}
        </p>
      </form>

      <div className={styles.simulate} role="radiogroup" aria-label="Demo outcome">
        <span>Demo outcome</span>
        {(["success", "error"] as const).map((o) => (
          <button key={o} type="button" role="radio" aria-checked={outcome === o} data-tone={o} onClick={() => setOutcome(o)}>
            {o === "success" ? "Success" : "Error"}
          </button>
        ))}
      </div>
    </div>
  );
}
