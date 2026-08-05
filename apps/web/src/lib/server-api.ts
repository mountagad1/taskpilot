// ============================================================
// TASKPILOT WEB — SERVER-SIDE API READS
// apps/web/src/lib/server-api.ts
//
// The public marketing pages render on the server and need catalogue data.
// They no longer reach into the database — they call the API service's
// public endpoints, exactly as any other client would.
//
// Every helper returns a fallback rather than throwing: an unreachable API
// must degrade a page, not 500 it.
// ============================================================

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(
  /\/+$/,
  ""
);

interface FetchOptions {
  /** Seconds to cache. 0 disables caching for per-request freshness. */
  revalidate?: number;
  timeoutMs?: number;
}

async function apiGet<T>(path: string, options: FetchOptions = {}): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: options.revalidate ?? 60 },
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { data?: T } | null;
    return (payload?.data ?? null) as T | null;
  } catch {
    // The API being down should not take the marketing site with it.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── MARKETPLACE ─────────────────────────────────────────────

export interface CatalogueAgent {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string;
  capabilities: string[];
  price_cents: number;
  currency: string;
  version: string;
  owner_id: string | null;
  install_count: number;
  run_count: number;
  sales_count: number;
  rating_avg: number;
  rating_count: number;
}

export async function listAgents(category?: string): Promise<CatalogueAgent[]> {
  const params = new URLSearchParams({ per_page: "48", sort: "popular" });
  if (category) params.set("category", category);

  const response = await fetch(`${API_URL}/v1/marketplace/agents?${params}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 },
  }).catch(() => null);

  if (!response?.ok) return [];

  const payload = (await response.json().catch(() => null)) as { data?: CatalogueAgent[] } | null;
  return payload?.data ?? [];
}

export async function getAgentBySlug(slug: string): Promise<CatalogueAgent | null> {
  return apiGet<CatalogueAgent>(`/v1/marketplace/agents/${encodeURIComponent(slug)}`);
}

/** True when the API service is reachable — used to explain an empty page. */
export async function apiReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`${API_URL}/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
