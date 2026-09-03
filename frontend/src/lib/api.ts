import type { Location } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API ${path} 回應 ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function getLocations(): Promise<Location[]> {
  return getJSON<Location[]>("/api/locations");
}

export function getLocation(slug: string): Promise<Location> {
  return getJSON<Location>(`/api/locations/${slug}`);
}

export { API_BASE };
