export type Tool = "select" | "hand" | "sticky" | "text" | "rect" | "ellipse" | "diamond" | "connector" | "pen" | "frame";

export type Box = { x: number; y: number; w: number; h: number };
export type ShapeKind = "rect" | "ellipse" | "diamond";

export type Sticky = Box & { id: string; type: "sticky"; text: string; color: string };
export type Shape = Box & { id: string; type: "shape"; kind: ShapeKind; text: string; color: string };
export type TextEl = Box & { id: string; type: "text"; text: string };
export type Frame = Box & { id: string; type: "frame"; title: string };
/** Freehand stroke; points are flat world coordinates [x0, y0, x1, y1, …]. */
export type Path = Box & { id: string; type: "path"; points: number[]; color: string };
/** A connector end is either pinned to an element (by id) or a free point. */
export type End = { id?: string; x: number; y: number };
export type Connector = { id: string; type: "connector"; from: End; to: End; color: string };

export type El = Sticky | Shape | TextEl | Frame | Path | Connector;
export type BoxEl = Exclude<El, Connector>;

export const STICKY_COLORS = ["#fff3a8", "#ffd8a8", "#ffc4d6", "#e0ccff", "#bfe3ff", "#c6f0c2"];
export const SHAPE_COLORS = ["#ffffff", "#bfe3ff", "#c6f0c2", "#fff3a8", "#ffc4d6", "#e0ccff"];
export const INK = "#1f2430";

let counter = 0;
export const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const isBox = (el: El): el is BoxEl => el.type !== "connector";

function sticky(x: number, y: number, text: string, color = STICKY_COLORS[0]): Sticky {
  return { id: uid(), type: "sticky", x, y, w: 170, h: 150, text, color };
}

/** Starter boards. */
export const TEMPLATES: { key: string; label: string; build: () => El[] }[] = [
  {
    key: "brainstorm",
    label: "Brainstorm",
    build: () => {
      const topic: Shape = { id: uid(), type: "shape", kind: "ellipse", x: -130, y: -60, w: 260, h: 120, text: "Team offsite 2026", color: "#e0ccff" };
      const ideas = [
        ["Cox's Bazar beach day", 0],
        ["Hackathon: 1 day", 1],
        ["Team dinner + awards", 2],
        ["Workshop: AI tools", 4],
        ["Budget: BDT 3 lakh", 5],
        ["Date: last week of Nov", 3],
      ] as const;
      const stickies = ideas.map(([text, c], i) => {
        const a = (i / ideas.length) * Math.PI * 2 - Math.PI / 2;
        return sticky(Math.cos(a) * 380 - 85, Math.sin(a) * 260 - 75, text, STICKY_COLORS[c]);
      });
      const links: Connector[] = stickies.map((s) => ({
        id: uid(),
        type: "connector",
        from: { id: topic.id, x: 0, y: 0 },
        to: { id: s.id, x: s.x, y: s.y },
        color: "#7c6fd6",
      }));
      const title: TextEl = { id: uid(), type: "text", x: -150, y: -400, w: 300, h: 40, text: "Brainstorm board" };
      return [title, topic, ...stickies, ...links];
    },
  },
  {
    key: "retro",
    label: "Retrospective",
    build: () => {
      const cols = [
        { title: "Went well", color: STICKY_COLORS[5], notes: ["Shipped the gallery on time", "Great pairing sessions"] },
        { title: "To improve", color: STICKY_COLORS[2], notes: ["Too many meetings", "Unclear priorities mid-sprint"] },
        { title: "Action items", color: STICKY_COLORS[4], notes: ["No-meeting Wednesdays", "Weekly priority check-in"] },
      ];
      const out: El[] = [];
      cols.forEach((col, i) => {
        const x = -620 + i * 420;
        out.push({ id: uid(), type: "frame", x, y: -260, w: 380, h: 560, title: col.title });
        col.notes.forEach((n, j) => out.push(sticky(x + 25 + (j % 2) * 175, -220 + Math.floor(j / 2) * 170, n, col.color)));
      });
      return out;
    },
  },
  { key: "blank", label: "Blank board", build: () => [] },
];

/** Font size that roughly fits `text` inside a w×h box. */
export function fitFont(text: string, w: number, h: number, max = 22, min = 9) {
  const chars = Math.max(8, text.length);
  return Math.max(min, Math.min(max, Math.sqrt((w * h * 0.42) / chars)));
}
