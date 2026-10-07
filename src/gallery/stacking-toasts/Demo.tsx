"use client";

import Toaster from "./Toaster";
import { useToaster } from "./useToaster";
import styles from "./Demo.module.css";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A mock mail app whose buttons fire each kind of toast.
export default function Demo() {
  const { toasts, show, dismiss, promise } = useToaster();

  const actions = [
    {
      label: "Save changes",
      tone: "success",
      run: () => show({ type: "success", title: "Changes saved", description: "Your signature was updated." }),
    },
    {
      label: "Upload report.pdf",
      tone: "loading",
      run: () =>
        promise(wait(2200), { loading: "Uploading report.pdf…", success: "report.pdf uploaded", error: "Upload failed" }).catch(() => {}),
    },
    {
      label: "Delete email",
      tone: "warning",
      run: () =>
        show({
          type: "warning",
          title: "Email moved to Trash",
          description: "“Q3 budget review” from Imran",
          duration: 6000,
          action: { label: "Undo", onClick: () => show({ type: "success", title: "Email restored" }) },
        }),
    },
    {
      label: "Go offline",
      tone: "error",
      run: () =>
        show({
          type: "error",
          title: "Connection lost",
          description: "Changes will sync when you're back online.",
          action: {
            label: "Retry",
            onClick: () =>
              promise(wait(1500), { loading: "Reconnecting…", success: "Back online", error: "Still offline" }).catch(() => {}),
          },
        }),
    },
    {
      label: "New message",
      tone: "info",
      run: () => show({ type: "info", title: "New message from Ayesha", description: "“Can we move the 3pm meeting to 4?”" }),
    },
    {
      label: "Burst ×4",
      tone: "burst",
      run: () => {
        const items = [
          { type: "info", title: "Nusrat joined #design" },
          { type: "success", title: "Invoice #1042 paid" },
          { type: "info", title: "3 new comments on “Roadmap”" },
          { type: "warning", title: "Storage 90% full" },
        ] as const;
        items.forEach((t, i) => setTimeout(() => show({ ...t }), i * 180));
      },
    },
  ];

  return (
    <div className={styles.frame}>
      <div className={styles.chrome}>
        <span />
        <span />
        <span />
        <strong>Inbox · Acme Mail</strong>
      </div>
      <div className={styles.body}>
        <p className={styles.heading}>Trigger a notification</p>
        <div className={styles.grid}>
          {actions.map((a) => (
            <button key={a.label} type="button" className={styles.trigger} data-tone={a.tone} onClick={a.run}>
              <span className={styles.dot} />
              {a.label}
            </button>
          ))}
        </div>
        <p className={styles.hint}>Hover the stack to expand · swipe a toast sideways to dismiss</p>
      </div>
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
