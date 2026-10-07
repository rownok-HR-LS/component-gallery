"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import MorphButton, { type Status } from "./MorphButton";
import styles from "./Demo.module.css";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A newsletter form wired to the button. The switch decides whether the fake request succeeds.
export default function Demo() {
  const [status, setStatus] = useState<Status>("idle");
  const [outcome, setOutcome] = useState<"success" | "error">("success");
  const [error, setError] = useState(false);
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
    setError(false);
    setStatus("loading");
    await wait(1400);
    if (!mounted.current) return;
    setStatus(outcome);
    await wait(outcome === "success" ? 2200 : 1500);
    if (!mounted.current) return;
    setStatus("idle");
    setError(outcome === "error");
  }

  return (
    <form className={styles.card} onSubmit={onSubmit}>
      <h3 className={styles.title}>Join the newsletter</h3>
      <p className={styles.subtitle}>One email a week. No spam.</p>
      <input className={styles.input} type="email" placeholder="you@example.com" aria-label="Email address" />
      <MorphButton
        type="submit"
        status={status}
        label={error ? "Try again" : "Subscribe"}
        messages={{ loading: "Subscribing…", success: "Subscribed!", error: "Something went wrong." }}
      />
      <p className={styles.error} aria-live="polite">
        {error ? "Couldn't subscribe. Please try again." : ""}
      </p>

      <div className={styles.simulate} role="radiogroup" aria-label="Simulate result">
        <span>Simulate</span>
        {(["success", "error"] as const).map((o) => (
          <button key={o} type="button" role="radio" aria-checked={outcome === o} onClick={() => setOutcome(o)}>
            {o === "success" ? "Success" : "Error"}
          </button>
        ))}
      </div>
    </form>
  );
}
