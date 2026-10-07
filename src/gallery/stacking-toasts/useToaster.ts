"use client";

import { useCallback, useState } from "react";

export type ToastType = "success" | "error" | "warning" | "info" | "loading";

export type ToastInput = {
  type?: ToastType;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  /** Milliseconds before auto-dismiss. Loading toasts stay until updated. */
  duration?: number;
};

export type ToastItem = ToastInput & {
  id: number;
  type: ToastType;
  duration: number;
  /** Bumped on every update so timers and progress bars restart. */
  version: number;
  removing?: boolean;
  /** Horizontal fly-out distance when dismissed by a swipe. */
  exitX?: number;
};

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 4000;
export const EXIT_MS = 350;

let nextId = 1;

const durationFor = (input: ToastInput) =>
  input.duration ?? (input.type === "loading" ? Infinity : DEFAULT_DURATION);

export function useToaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number, exitX = 0) => {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, removing: true, exitX } : t)));
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const show = useCallback((input: ToastInput) => {
    const id = nextId++;
    const item: ToastItem = { ...input, id, type: input.type ?? "info", duration: durationFor(input), version: 0 };
    setToasts((ts) => [...ts, item].slice(-MAX_TOASTS));
    return id;
  }, []);

  const update = useCallback((id: number, input: ToastInput) => {
    setToasts((ts) =>
      ts.map((t) =>
        t.id === id ? { ...t, ...input, type: input.type ?? t.type, duration: durationFor(input), version: t.version + 1 } : t,
      ),
    );
  }, []);

  /** Shows a loading toast that turns into success or error when the promise settles. */
  const promise = useCallback(
    async <T,>(work: Promise<T>, messages: { loading: string; success: string; error: string }) => {
      const id = show({ type: "loading", title: messages.loading });
      try {
        const value = await work;
        update(id, { type: "success", title: messages.success });
        return value;
      } catch (err) {
        update(id, { type: "error", title: messages.error });
        throw err;
      }
    },
    [show, update],
  );

  return { toasts, show, update, dismiss, promise };
}
