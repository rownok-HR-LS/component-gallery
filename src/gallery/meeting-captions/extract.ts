// Rule-based meeting notes: finds action items (with owner and due date), decisions and
// questions in transcript segments. No AI service: just patterns over each sentence.

export type Segment = { id: number; speaker: number; text: string; start: number; end: number };
export type ItemKind = "action" | "decision" | "question";
export type Item = { id: string; kind: ItemKind; text: string; owner?: string; due?: string; dueDate?: Date; segmentId: number; at: number };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAY = "(?:sun|mon|tues|wednes|thurs|fri|satur)day";
const RELATIVE = "(?:today|tonight|tomorrow|this week|next week|next month|end of (?:the )?(?:day|week|month)|eod|eow)";
const DATE = `(?:\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}|${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?)`;

export const DUE_RE = new RegExp(`\\b(?:(?:by|before|on|until|due|this|next)\\s+)?(?:${DAY}|${DATE}|${RELATIVE})\\b`, "i");
export const MONEY_RE = /(?:(?:BDT|Tk\.?|৳|\$|USD)\s?\d[\d,.]*(?:\s?(?:lakh|crore|k|m|million))?|\d[\d,.]*\s?(?:lakh|crore|taka|BDT))/gi;

const DECISION_RE = /\b(?:we(?:'ve| have)? (?:decided|agreed)|decided to|(?:the )?decision is|let'?s go with|we'?ll go with|we are going with|approved|signed off)\b/i;
const ACTION_RE =
  /\b(?:i'?ll|i will|i am going to|i'm going to|we'?ll|we will|we need to|we should|let'?s|can you|could you|would you|please|make sure|follow up|action item|to-?do|assign(?:ed)? (?:it )?to|(?:will|to) (?:send|share|prepare|review|update|schedule|book|call|email|draft|fix|finish|collect|create|organi[sz]e|confirm|check))\b/i;
const QUESTION_START = /^(?:what|why|how|when|where|who|which|should|shall|do|does|did|is|are|can|could|will|would)\b/i;
const FILLER = /^(?:(?:ok(?:ay)?|so|and|also|um+|uh+|well|right|yes|yeah|sure|great|perfect|alright|agreed|then|now)[,.!]?\s+)+/i;
const NOT_NAMES = new Set(["I", "We", "You", "Let", "Lets", "Can", "Could", "Would", "Please", "Make", "So", "And", "Also", "Okay", "Ok", "Yes", "The", "That", "This", "It", "They", "Sure", "Great", "Perfect", "Agreed", "Around", "What", "Should"]);

/** Splits a caption into sentences (speech engines often skip punctuation, so a whole caption can be one). */
export function sentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The next given weekday (0 = Sunday) on or after `from`; same day only when `allowToday`. */
function nextWeekday(from: Date, day: number, allowToday = false) {
  const d = new Date(from);
  let diff = (day - d.getDay() + 7) % 7;
  if (diff === 0 && !allowToday) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Turns "by Friday", "tomorrow", "20 October" into a concrete date relative to the meeting. */
export function resolveDue(phrase: string, meeting: Date): Date | undefined {
  const p = phrase.toLowerCase();
  const d = new Date(meeting);
  d.setHours(0, 0, 0, 0);
  if (/today|tonight|eod|end of (the )?day/.test(p)) return d;
  if (/tomorrow/.test(p)) return new Date(d.getTime() + 864e5);
  if (/next week/.test(p)) return nextWeekday(d, 1);
  if (/eow|end of (the )?week|this week/.test(p)) return nextWeekday(d, 5, true);
  if (/next month|end of (the )?month/.test(p)) return new Date(d.getFullYear(), d.getMonth() + 1, /next/.test(p) ? 1 : 0);
  const wd = WEEKDAYS.findIndex((w) => p.includes(w));
  if (wd >= 0) return nextWeekday(d, wd);
  const day = p.match(/\d{1,2}/);
  const month = MONTHS.findIndex((m) => p.includes(m.slice(0, 3)));
  if (day && month >= 0) {
    const out = new Date(d.getFullYear(), month, Number(day[0]));
    if (out < d) out.setFullYear(out.getFullYear() + 1);
    return out;
  }
  return undefined;
}

function findOwner(sentence: string, speakerName: string, speakers: string[]) {
  const assigned = sentence.match(/assign(?:ed)? (?:it |this )?to ([A-Z][a-z]+)/);
  if (assigned) return assigned[1];
  const named = sentence.match(/\b([A-Z][a-z]+),?\s+(?:can you|could you|would you|please|will|you'?ll|to)\b/);
  if (named && !NOT_NAMES.has(named[1])) return named[1];
  if (/\b(?:i'?ll|i will|i am going to|i'm going to)\b/i.test(sentence)) return speakerName;
  if (/\b(?:we'?ll|we will|we need to|we should|let'?s)\b/i.test(sentence)) return "Team";
  const mention = speakers.find((s) => s && new RegExp(`\\b${s}\\b`).test(sentence) && s !== speakerName);
  return mention;
}

/** "Imran, can you send the final budget to finance by Friday?" → "Send the final budget to finance". */
function cleanTask(sentence: string, due?: string) {
  let t = sentence.replace(FILLER, "");
  t = t.replace(/^[A-Z][a-z]+,\s+/, "");
  t = t.replace(/^assign(?:ed)? (?:it |this )?to [A-Z][a-z]+ to\s+/i, "");
  t = t.replace(/^(?:can you|could you|would you|please|i'?ll|i will|i am going to|i'm going to|we'?ll|we will|we need to|we should|let'?s)\s+/i, "");
  t = t.replace(/^please\s+/i, "");
  if (due) t = t.replace(new RegExp(`\\s*\\b${due.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "");
  t = t.replace(/[\s,]*[.?!]+$/, "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

// Talk about the meeting itself ("let's start", "let's wrap up") isn't a task.
const MEETING_TALK = /\b(?:let'?s|we'?ll|we will)\s+(?:start|begin|kick off|wrap up|end|finish|move on|get started)\b/i;

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function analyse(segments: Segment[], speakers: string[], meeting = new Date()): Item[] {
  const items: Item[] = [];
  for (const seg of segments) {
    sentences(seg.text).forEach((raw, i) => {
      const s = capitalise(raw.replace(FILLER, ""));
      if (s.split(/\s+/).length < 3) return;
      const id = `${seg.id}-${i}`;
      const due = s.match(DUE_RE)?.[0];
      const base = { id, segmentId: seg.id, at: seg.start };
      if (DECISION_RE.test(s)) {
        items.push({ ...base, kind: "decision", text: s.replace(/[.!]+$/, "") });
      } else if (ACTION_RE.test(s) && !MEETING_TALK.test(s)) {
        const owner = findOwner(s, speakers[seg.speaker] ?? "Speaker", speakers);
        items.push({ ...base, kind: "action", text: cleanTask(s, due), owner, due, dueDate: due ? resolveDue(due, meeting) : undefined });
      } else if (s.endsWith("?") || QUESTION_START.test(s)) {
        items.push({ ...base, kind: "question", text: s });
      }
    });
  }
  return items;
}

/** A short scripted planning meeting used by the demo. */
export const SAMPLE: { speaker: number; text: string }[] = [
  { speaker: 0, text: "Okay, let's start the planning meeting for the team offsite." },
  { speaker: 1, text: "The venue quote came in at BDT 2.8 lakh, which is within our budget." },
  { speaker: 0, text: "Great. So we've decided to go with Cox's Bazar for the offsite." },
  { speaker: 2, text: "I'll book the hotel rooms by Thursday." },
  { speaker: 0, text: "Imran, can you send the final budget to finance by Friday?" },
  { speaker: 1, text: "Sure. Should we include the travel allowance in the same sheet?" },
  { speaker: 0, text: "Yes, keep everything in one sheet so it's easy to approve." },
  { speaker: 2, text: "We need to collect dietary preferences from everyone by next week." },
  { speaker: 0, text: "Agreed. I will draft the announcement email tomorrow." },
  { speaker: 1, text: "What time does the bus leave on the first day?" },
  { speaker: 2, text: "Around 7 am. Make sure everyone gets the itinerary by 20 October." },
  { speaker: 0, text: "Perfect, that's everything for today. Thanks, everyone." },
];
