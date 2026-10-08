import type { El } from "./model";

/** Someone else on the board. x/y are world coordinates of their cursor, once they have moved it. */
export type Peer = { id: string; name: string; color: string; x?: number; y?: number; seen: number };

type Identity = { id: string; name: string; color: string };
type Message =
  | { kind: "hello"; from: string; name: string; color: string }
  | { kind: "presence"; from: string; name: string; color: string }
  | { kind: "state"; from: string; elements: El[] }
  | { kind: "cursor"; from: string; name: string; color: string; x: number; y: number }
  | { kind: "bye"; from: string };

const NAMES = ["Fox", "Owl", "Otter", "Panda", "Tiger", "Koala", "Falcon", "Lynx"];
const COLORS = ["#e34948", "#2a78d6", "#1baf7a", "#eb6834", "#4a3aa7", "#e87ba4", "#0e9aa7", "#c98500"];
const HEARTBEAT = 2500;
const TIMEOUT = 8000;

export function makeIdentity(): Identity {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: `${["Blue", "Swift", "Calm", "Bright", "Bold", "Quiet"][Math.floor(Math.random() * 6)]} ${NAMES[Math.floor(Math.random() * NAMES.length)]}`,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

/**
 * Same-device live collaboration between browser tabs via BroadcastChannel. The board is
 * last-writer-wins; presence is a heartbeat, and cursors are sent separately.
 */
export function connect(
  channelName: string,
  me: Identity,
  handlers: { onState: (elements: El[]) => void; onPeers: (peers: Peer[]) => void; getState: () => El[] },
) {
  if (typeof BroadcastChannel === "undefined") {
    return { sendState: () => {}, sendCursor: () => {}, close: () => {} };
  }
  const channel = new BroadcastChannel(channelName);
  const peers = new Map<string, Peer>();
  const publish = () => handlers.onPeers([...peers.values()]);
  const post = (m: Message) => channel.postMessage(m);
  const seen = (id: string, name: string, color: string, pos?: { x: number; y: number }) => {
    const prev = peers.get(id);
    peers.set(id, { id, name, color, x: pos?.x ?? prev?.x, y: pos?.y ?? prev?.y, seen: Date.now() });
    publish();
  };

  channel.onmessage = ({ data }: MessageEvent<Message>) => {
    if (!data || data.from === me.id) return;
    switch (data.kind) {
      case "hello":
        seen(data.from, data.name, data.color);
        // Introduce ourselves and hand the newcomer the current board.
        post({ kind: "presence", from: me.id, name: me.name, color: me.color });
        post({ kind: "state", from: me.id, elements: handlers.getState() });
        break;
      case "presence":
        seen(data.from, data.name, data.color);
        break;
      case "cursor":
        seen(data.from, data.name, data.color, { x: data.x, y: data.y });
        break;
      case "state":
        handlers.onState(data.elements);
        break;
      case "bye":
        if (peers.delete(data.from)) publish();
        break;
    }
  };

  const heartbeat = setInterval(() => {
    post({ kind: "presence", from: me.id, name: me.name, color: me.color });
    let changed = false;
    for (const [id, p] of peers) {
      if (Date.now() - p.seen > TIMEOUT) {
        peers.delete(id);
        changed = true;
      }
    }
    if (changed) publish();
  }, HEARTBEAT);

  const bye = () => post({ kind: "bye", from: me.id });
  window.addEventListener("pagehide", bye);
  post({ kind: "hello", from: me.id, name: me.name, color: me.color });

  return {
    sendState: (elements: El[]) => post({ kind: "state", from: me.id, elements }),
    sendCursor: (x: number, y: number) => post({ kind: "cursor", from: me.id, name: me.name, color: me.color, x, y }),
    close: () => {
      bye();
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", bye);
      channel.close();
    },
  };
}
