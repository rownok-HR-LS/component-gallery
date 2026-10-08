// Free, key-less OpenStreetMap services. Search runs only on Enter (Nominatim asks for ≤1 request/s,
// no autocomplete), and routes are cached per day so edits don't re-request unchanged legs.

export type Place = { name: string; detail: string; lat: number; lng: number };
export type Leg = { distance: number; duration: number };
export type Route = { coords: [number, number][]; legs: Leg[]; estimated: boolean };

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OSRM = "https://router.project-osrm.org/route/v1/driving";

export async function searchPlaces(query: string, view?: { west: number; south: number; east: number; north: number }) {
  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "6", "accept-language": "en" });
  if (view) params.set("viewbox", `${view.west},${view.north},${view.east},${view.south}`);
  const res = await fetch(`${NOMINATIM}/search?${params}`);
  if (!res.ok) throw new Error("Search failed");
  const data: { name?: string; display_name: string; lat: string; lon: string }[] = await res.json();
  return data.map<Place>((d) => {
    const [first, ...rest] = d.display_name.split(", ");
    return { name: d.name || first, detail: rest.slice(0, 3).join(", "), lat: Number(d.lat), lng: Number(d.lon) };
  });
}

export async function reverseGeocode(lat: number, lng: number) {
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: "jsonv2", zoom: "17", "accept-language": "en" });
    const res = await fetch(`${NOMINATIM}/reverse?${params}`);
    const d: { name?: string; display_name?: string } = await res.json();
    return d.name || d.display_name?.split(", ").slice(0, 2).join(", ") || "Pinned place";
  } catch {
    return "Pinned place";
  }
}

/** Great-circle distance in metres. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Straight lines with a road-detour factor and ~35 km/h, used when routing is unavailable. */
export function estimateRoute(points: { lat: number; lng: number }[]): Route {
  const legs = points.slice(1).map((p, i) => {
    const distance = haversine(points[i], p) * 1.3;
    return { distance, duration: distance / (35_000 / 3600) };
  });
  return { coords: points.map((p) => [p.lat, p.lng]), legs, estimated: true };
}

const cache = new Map<string, Route>();

export async function routeFor(points: { lat: number; lng: number }[]): Promise<Route> {
  if (points.length < 2) return { coords: [], legs: [], estimated: false };
  const key = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const res = await fetch(`${OSRM}/${key}?overview=full&geometries=geojson`);
    const data = await res.json();
    if (data.code !== "Ok") throw new Error(data.code);
    const r = data.routes[0];
    const route: Route = {
      coords: r.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
      legs: r.legs.map((l: Leg) => ({ distance: l.distance, duration: l.duration })),
      estimated: false,
    };
    cache.set(key, route);
    return route;
  } catch {
    return estimateRoute(points);
  }
}

export const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`);
export const mins = (s: number) => {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
};
