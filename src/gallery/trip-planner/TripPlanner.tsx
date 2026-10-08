"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type * as Leaflet from "leaflet";
import {
  CATEGORIES,
  DAY_COLORS,
  dayDate,
  decodeTrip,
  encodeTrip,
  sampleTrip,
  toIcs,
  uid,
  type Category,
  type Stop,
  type Trip,
} from "./model";
import { km, mins, reverseGeocode, routeFor, searchPlaces, type Place, type Route } from "./services";
import styles from "./TripPlanner.module.css";

const STORAGE_KEY = "gallery-trip-v1";
type Tab = "plan" | "budget" | "packing";

const money = (v: number) => `৳${Math.round(v).toLocaleString("en-IN")}`;
const colorOf = (i: number) => DAY_COLORS[i % DAY_COLORS.length];
const fmtDay = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TripPlanner() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tab, setTab] = useState<Tab>("plan");
  const [day, setDay] = useState(0);
  const [openStop, setOpenStop] = useState<string | null>(null);
  const [routes, setRoutes] = useState<Record<string, Route>>({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState("");
  const [packDraft, setPackDraft] = useState("");
  const [extraDraft, setExtraDraft] = useState({ label: "", cost: "" });
  const [mapReady, setMapReady] = useState(false);

  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const tripRef = useRef(trip);
  tripRef.current = trip;
  const dayRef = useRef(day);
  dayRef.current = day;
  const dragging = useRef<{ day: number; index: number } | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };

  // ── Load: a shared link wins, then saved trip, then the sample ──────────────────────
  useEffect(() => {
    (async () => {
      const shared = window.location.hash.match(/trip=([^&]+)/)?.[1];
      if (shared) {
        const t = await decodeTrip(shared);
        if (t) {
          setTrip(t);
          notify("Opened a shared trip");
          return;
        }
      }
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          setTrip(JSON.parse(saved));
          return;
        }
      } catch {}
      setTrip(sampleTrip());
    })();
  }, []);

  useEffect(() => {
    if (!trip) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
    } catch {}
  }, [trip]);

  const update = (fn: (t: Trip) => Trip) => setTrip((t) => (t ? fn(structuredClone(t)) : t));

  // ── Map setup (Leaflet touches window, so it is imported on the client only) ────────
  useEffect(() => {
    let disposed = false;
    (async () => {
      const lib = (await import("leaflet")).default;
      if (disposed || !mapEl.current) return;
      L.current = lib;
      const m = lib.map(mapEl.current, { zoomControl: true, scrollWheelZoom: true }).setView([21.4, 92.0], 11);
      lib
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
        .addTo(m);
      layer.current = lib.layerGroup().addTo(m);
      m.on("click", (e: Leaflet.LeafletMouseEvent) => showAddPopup(e.latlng.lat, e.latlng.lng));
      map.current = m;
      setMapReady(true);
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showAddPopup(lat: number, lng: number) {
    const lib = L.current;
    const m = map.current;
    if (!lib || !m || !tripRef.current) return;
    const box = document.createElement("div");
    box.className = styles.popup;
    const title = document.createElement("strong");
    title.textContent = "Looking up this place…";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `Add to Day ${dayRef.current + 1}`;
    btn.style.background = colorOf(dayRef.current);
    box.append(title, btn);
    const popup = lib.popup().setLatLng([lat, lng]).setContent(box).openOn(m);
    let name = "Pinned place";
    reverseGeocode(lat, lng).then((n) => {
      name = n;
      title.textContent = n;
    });
    btn.onclick = () => {
      addStop({ name, lat, lng, detail: "" }, dayRef.current);
      m.closePopup(popup);
    };
  }

  // ── Routes: re-fetch a day's route when its stops change (debounced, cached) ────────
  const signature = trip?.days.map((d) => d.id + ":" + d.stops.map((s) => `${s.lat},${s.lng}`).join("|")).join("/") ?? "";
  useEffect(() => {
    if (!trip) return;
    const timer = setTimeout(async () => {
      const next: Record<string, Route> = {};
      for (const d of trip.days) next[d.id] = await routeFor(d.stops);
      setRoutes(next);
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // ── Draw markers and routes ─────────────────────────────────────────────────────────
  useEffect(() => {
    const lib = L.current;
    const group = layer.current;
    if (!mapReady || !lib || !group || !trip) return;
    group.clearLayers();
    trip.days.forEach((d, di) => {
      const active = di === day;
      const color = colorOf(di);
      const route = routes[d.id];
      const line = route?.coords.length ? route.coords : d.stops.map((s) => [s.lat, s.lng] as [number, number]);
      if (line.length > 1) {
        lib
          .polyline(line, { color, weight: active ? 5 : 3, opacity: active ? 0.9 : 0.35, dashArray: route?.estimated ? "6 8" : undefined })
          .addTo(group);
      }
      d.stops.forEach((s, si) => {
        const icon = lib.divIcon({
          className: "",
          html: `<span class="${styles.pin}" data-active="${active}" data-open="${openStop === s.id}" style="--c:${color}"><b>${si + 1}</b></span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 32],
        });
        lib
          .marker([s.lat, s.lng], { icon, zIndexOffset: active ? 1000 : 0, title: s.name })
          .on("click", () => {
            setDay(di);
            setTab("plan");
            setOpenStop(s.id);
          })
          .addTo(group);
      });
    });
  }, [trip, routes, day, openStop, mapReady]);

  // Fit the selected day on screen.
  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    const stops = trip?.days[day]?.stops ?? [];
    if (!mapReady || !lib || !m || !stops.length) return;
    if (stops.length === 1) m.flyTo([stops[0].lat, stops[0].lng], 14, { duration: 0.6 });
    else m.flyToBounds(lib.latLngBounds(stops.map((s) => [s.lat, s.lng])), { padding: [50, 50], duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, mapReady, trip?.days.length]);

  // ── Actions ─────────────────────────────────────────────────────────────────────────
  function addStop(place: Place, dayIndex: number) {
    const s: Stop = { id: uid(), name: place.name, lat: place.lat, lng: place.lng, category: "sight", time: "", cost: 0, note: "" };
    update((t) => {
      t.days[dayIndex].stops.push(s);
      return t;
    });
    setOpenStop(s.id);
    setResults(null);
    setQuery("");
    notify(`Added to Day ${dayIndex + 1}`);
  }

  function editStop(dayIndex: number, id: string, patch: Partial<Stop>) {
    update((t) => {
      const s = t.days[dayIndex].stops.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
      return t;
    });
  }

  function moveStop(from: { day: number; index: number }, toDay: number, toIndex: number) {
    update((t) => {
      const [s] = t.days[from.day].stops.splice(from.index, 1);
      const target = t.days[toDay].stops;
      const index = from.day === toDay && toIndex > from.index ? toIndex - 1 : toIndex;
      target.splice(Math.min(index, target.length), 0, s);
      return t;
    });
  }

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const b = map.current?.getBounds();
      setResults(await searchPlaces(q, b && { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }));
    } catch {
      setResults([]);
      notify("Search is unavailable right now");
    } finally {
      setSearching(false);
    }
  }

  async function share() {
    if (!trip) return;
    const url = `${window.location.origin}${window.location.pathname}#trip=${await encodeTrip(trip)}`;
    await navigator.clipboard.writeText(url);
    notify("Share link copied. Anyone with it sees this trip");
  }

  const onDrop = (e: DragEvent, toDay: number, toIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragging.current) moveStop(dragging.current, toDay, toIndex);
    dragging.current = null;
  };

  // ── Derived numbers ─────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    if (!trip) return null;
    const byCat = new Map<string, number>();
    for (const d of trip.days) for (const s of d.stops) byCat.set(s.category, (byCat.get(s.category) ?? 0) + s.cost);
    const extras = trip.extras.reduce((a, x) => a + x.cost, 0);
    if (extras) byCat.set("extras", extras);
    const total = [...byCat.values()].reduce((a, b) => a + b, 0);
    return { byCat, total, perPerson: total / Math.max(1, trip.travelers) };
  }, [trip]);

  if (!trip || !totals) {
    return (
      <div className={styles.card}>
        <div className={styles.loading}>Loading your trip…</div>
      </div>
    );
  }

  const current = trip.days[day] ?? trip.days[0];
  const route = routes[current?.id];
  const dayDistance = route?.legs.reduce((a, l) => a + l.distance, 0) ?? 0;
  const dayDuration = route?.legs.reduce((a, l) => a + l.duration, 0) ?? 0;
  const packed = trip.packing.filter((p) => p.done).length;

  return (
    <div className={styles.card}>
      <header className={styles.head}>
        <div className={styles.titleRow}>
          <input className={styles.tripName} value={trip.name} onChange={(e) => update((t) => ({ ...t, name: e.target.value }))} aria-label="Trip name" />
          <div className={styles.headActions}>
            <button type="button" className={styles.ghost} onClick={share}>
              Share link
            </button>
            <button type="button" className={styles.ghost} onClick={() => download(toIcs(trip), `${trip.name || "trip"}.ics`, "text/calendar")}>
              Add to calendar
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => {
                if (window.confirm("Start over with the sample trip? Your current plan will be replaced.")) {
                  setTrip(sampleTrip());
                  setDay(0);
                  history.replaceState(null, "", window.location.pathname);
                }
              }}
            >
              Reset
            </button>
          </div>
        </div>
        <div className={styles.meta}>
          <label>
            Starts
            <input type="date" value={trip.start} onChange={(e) => e.target.value && update((t) => ({ ...t, start: e.target.value }))} />
          </label>
          <label>
            Travellers
            <input
              type="number"
              min={1}
              max={50}
              value={trip.travelers}
              onChange={(e) => update((t) => ({ ...t, travelers: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }))}
            />
          </label>
          <span className={styles.metaStat}>
            {trip.days.length} days · {trip.days.reduce((a, d) => a + d.stops.length, 0)} stops · {money(totals.total)} total
          </span>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.mapWrap}>
          <div ref={mapEl} className={styles.map} aria-label="Trip map. Click anywhere to add a place." />
          <div className={styles.dayStrip} role="tablist" aria-label="Days">
            {trip.days.map((d, i) => (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={day === i}
                style={{ ["--c" as string]: colorOf(i) }}
                onClick={() => setDay(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, i, trip.days[i].stops.length)}
              >
                Day {i + 1}
              </button>
            ))}
          </div>
          <p className={styles.mapHint}>Click the map to add a place</p>
        </div>

        <section className={styles.panel}>
          <div className={styles.tabs} role="tablist">
            {(
              [
                ["plan", "Itinerary"],
                ["budget", `Budget · ${money(totals.perPerson)}/person`],
                ["packing", `Packing ${packed}/${trip.packing.length}`],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>

          {tab === "plan" && (
            <>
              <form
                className={styles.search}
                onSubmit={(e) => {
                  e.preventDefault();
                  search();
                }}
              >
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a place, e.g. Inani Beach" aria-label="Search places" />
                <button type="submit" disabled={searching}>
                  {searching ? "…" : "Search"}
                </button>
              </form>
              {results && (
                <ul className={styles.results}>
                  {results.length === 0 && <li className={styles.noResults}>No places found.</li>}
                  {results.map((r, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className={styles.resultPeek}
                        onClick={() => map.current?.flyTo([r.lat, r.lng], 14, { duration: 0.6 })}
                      >
                        <strong>{r.name}</strong>
                        <span>{r.detail}</span>
                      </button>
                      <button type="button" className={styles.addBtn} style={{ background: colorOf(day) }} onClick={() => addStop(r, day)}>
                        + Day {day + 1}
                      </button>
                    </li>
                  ))}
                  <li>
                    <button type="button" className={styles.closeResults} onClick={() => setResults(null)}>
                      Close results
                    </button>
                  </li>
                </ul>
              )}

              <div className={styles.dayHead} style={{ ["--c" as string]: colorOf(day) }}>
                <div>
                  <strong>Day {day + 1}</strong>
                  <span>{fmtDay(dayDate(trip, day))}</span>
                </div>
                <span className={styles.dayStats}>
                  {current.stops.length > 1 ? `${km(dayDistance)} · ${mins(dayDuration)}${route?.estimated ? " (est.)" : ""}` : "Add stops to see the route"}
                </span>
              </div>

              <ol className={styles.stops} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, day, current.stops.length)}>
                {current.stops.length === 0 && <li className={styles.emptyDay}>No stops yet. Search above or click the map.</li>}
                {current.stops.map((s, i) => {
                  const leg = route?.legs[i - 1];
                  const open = openStop === s.id;
                  return (
                    <li key={s.id} className={styles.stopWrap}>
                      {i > 0 && leg && (
                        <div className={styles.leg}>
                          <span>
                            {km(leg.distance)} · {mins(leg.duration)}
                          </span>
                        </div>
                      )}
                      <div
                        className={styles.stop}
                        data-open={open}
                        draggable
                        onDragStart={() => (dragging.current = { day, index: i })}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => onDrop(e, day, i)}
                      >
                        <button
                          type="button"
                          className={styles.stopMain}
                          onClick={() => {
                            setOpenStop(open ? null : s.id);
                            map.current?.flyTo([s.lat, s.lng], Math.max(map.current.getZoom(), 13), { duration: 0.5 });
                          }}
                          aria-expanded={open}
                        >
                          <span className={styles.num} style={{ background: colorOf(day) }}>
                            {i + 1}
                          </span>
                          <span className={styles.stopText}>
                            <strong>{s.name}</strong>
                            <span>
                              {s.time && `${s.time} · `}
                              {CATEGORIES.find((c) => c.key === s.category)?.label}
                              {s.cost > 0 && ` · ${money(s.cost)}`}
                            </span>
                          </span>
                          <span className={styles.grip} aria-hidden="true">
                            ⋮⋮
                          </span>
                        </button>
                        {open && (
                          <div className={styles.editor}>
                            <label>
                              Name
                              <input value={s.name} onChange={(e) => editStop(day, s.id, { name: e.target.value })} />
                            </label>
                            <div className={styles.row3}>
                              <label>
                                Time
                                <input type="time" value={s.time} onChange={(e) => editStop(day, s.id, { time: e.target.value })} />
                              </label>
                              <label>
                                Type
                                <select value={s.category} onChange={(e) => editStop(day, s.id, { category: e.target.value as Category })}>
                                  {CATEGORIES.map((c) => (
                                    <option key={c.key} value={c.key}>
                                      {c.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Cost (৳)
                                <input type="number" min={0} value={s.cost || ""} onChange={(e) => editStop(day, s.id, { cost: Math.max(0, Number(e.target.value) || 0) })} />
                              </label>
                            </div>
                            <label>
                              Note
                              <input value={s.note} placeholder="Tickets, booking ref, tips…" onChange={(e) => editStop(day, s.id, { note: e.target.value })} />
                            </label>
                            <div className={styles.editorActions}>
                              <label className={styles.inline}>
                                Move to
                                <select value={day} onChange={(e) => moveStop({ day, index: i }, Number(e.target.value), Infinity)}>
                                  {trip.days.map((_, di) => (
                                    <option key={di} value={di}>
                                      Day {di + 1}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <span>
                                <button type="button" className={styles.iconBtn} disabled={i === 0} onClick={() => moveStop({ day, index: i }, day, i - 1)} aria-label="Move up">
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  className={styles.iconBtn}
                                  disabled={i === current.stops.length - 1}
                                  onClick={() => moveStop({ day, index: i }, day, i + 2)}
                                  aria-label="Move down"
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  className={styles.danger}
                                  onClick={() =>
                                    update((t) => {
                                      t.days[day].stops = t.days[day].stops.filter((x) => x.id !== s.id);
                                      return t;
                                    })
                                  }
                                >
                                  Remove
                                </button>
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className={styles.dayActions}>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => {
                    update((t) => ({ ...t, days: [...t.days, { id: uid(), stops: [] }] }));
                    setDay(trip.days.length);
                  }}
                >
                  + Add day
                </button>
                {trip.days.length > 1 && (
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={() => {
                      if (current.stops.length && !window.confirm(`Delete Day ${day + 1} and its ${current.stops.length} stops?`)) return;
                      update((t) => ({ ...t, days: t.days.filter((_, i) => i !== day) }));
                      setDay(Math.max(0, day - 1));
                    }}
                  >
                    Delete Day {day + 1}
                  </button>
                )}
              </div>
            </>
          )}

          {tab === "budget" && (
            <div className={styles.budget}>
              <div className={styles.bigNumbers}>
                <div>
                  <strong>{money(totals.total)}</strong>
                  <span>trip total</span>
                </div>
                <div>
                  <strong>{money(totals.perPerson)}</strong>
                  <span>per person ({trip.travelers})</span>
                </div>
              </div>
              <ul className={styles.breakdown}>
                {[...totals.byCat.entries()]
                  .filter(([, v]) => v > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <li key={k}>
                      <span>{k === "extras" ? "Extras" : CATEGORIES.find((c) => c.key === k)?.label}</span>
                      <span className={styles.bar}>
                        <span style={{ width: `${(v / Math.max(1, totals.total)) * 100}%` }} />
                      </span>
                      <span className={styles.amount}>{money(v)}</span>
                    </li>
                  ))}
              </ul>
              <h4 className={styles.subhead}>Extras (tickets, transport, tips)</h4>
              <ul className={styles.extras}>
                {trip.extras.map((x) => (
                  <li key={x.id}>
                    <span>{x.label}</span>
                    <span>{money(x.cost)}</span>
                    <button type="button" aria-label={`Remove ${x.label}`} onClick={() => update((t) => ({ ...t, extras: t.extras.filter((e) => e.id !== x.id) }))}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className={styles.addRow}
                onSubmit={(e) => {
                  e.preventDefault();
                  const cost = Number(extraDraft.cost);
                  if (!extraDraft.label.trim() || !(cost > 0)) return;
                  update((t) => ({ ...t, extras: [...t.extras, { id: uid(), label: extraDraft.label.trim(), cost }] }));
                  setExtraDraft({ label: "", cost: "" });
                }}
              >
                <input placeholder="e.g. Bus tickets" value={extraDraft.label} onChange={(e) => setExtraDraft((d) => ({ ...d, label: e.target.value }))} />
                <input placeholder="৳" type="number" min={0} value={extraDraft.cost} onChange={(e) => setExtraDraft((d) => ({ ...d, cost: e.target.value }))} />
                <button type="submit">Add</button>
              </form>
              <p className={styles.hint}>Stop costs are set on each stop in the itinerary.</p>
            </div>
          )}

          {tab === "packing" && (
            <div className={styles.packing}>
              <div className={styles.progress}>
                <span style={{ width: `${(packed / Math.max(1, trip.packing.length)) * 100}%` }} />
              </div>
              <ul>
                {trip.packing.map((p) => (
                  <li key={p.id} data-done={p.done}>
                    <label>
                      <input
                        type="checkbox"
                        checked={p.done}
                        onChange={() => update((t) => ({ ...t, packing: t.packing.map((x) => (x.id === p.id ? { ...x, done: !x.done } : x)) }))}
                      />
                      {p.label}
                    </label>
                    <button type="button" aria-label={`Remove ${p.label}`} onClick={() => update((t) => ({ ...t, packing: t.packing.filter((x) => x.id !== p.id) }))}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className={styles.addRow}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!packDraft.trim()) return;
                  update((t) => ({ ...t, packing: [...t.packing, { id: uid(), label: packDraft.trim(), done: false }] }));
                  setPackDraft("");
                }}
              >
                <input placeholder="Add an item" value={packDraft} onChange={(e) => setPackDraft(e.target.value)} />
                <button type="submit">Add</button>
              </form>
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
      <p className={styles.credit}>Map data © OpenStreetMap contributors · Routing by OSRM · Search by Nominatim. Your trip is saved in this browser.</p>
    </div>
  );
}
