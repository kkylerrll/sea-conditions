import type { Location, ReportInput, ReportSummary } from "./types";

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

export function getReports(slug: string, days = 7): Promise<ReportSummary> {
  return getJSON<ReportSummary>(`/api/locations/${slug}/reports?days=${days}`);
}

export type PostReportResult = { ok: true } | { ok: false; status: number };

/** 送出實測回報。不用 getJSON：要把 409／429／422 分開處理；網路錯誤回 status 0。 */
export async function postReport(slug: string, body: ReportInput): Promise<PostReportResult> {
  try {
    const res = await fetch(`${API_BASE}/api/locations/${slug}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok ? { ok: true } : { ok: false, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export { API_BASE };
