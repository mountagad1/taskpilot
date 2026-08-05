// ============================================================
// TASKPILOT — MARKETPLACE BROWSE
// services/api/src/lib/browse.ts
//
// The public catalogue query, shared by the marketplace page, the extension's
// agent picker and the developer API.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { AGENT_CATEGORIES } from "@taskpilot/shared";

import { badRequest } from "./errors";
import { readPagination } from "../middleware/kernel";
import type { Context } from "hono";

export const BROWSE_COLUMNS =
  "id, slug, name, tagline, description, category, capabilities, price_cents, currency, " +
  "version, owner_id, install_count, run_count, sales_count, rating_avg, rating_count, created_at";

export type BrowseSort = "popular" | "newest" | "rating" | "price";

export interface BrowseResult<T> {
  items: T[];
  meta: { total: number; page: number; per_page: number };
}

/**
 * Only ever returns agents that are both `listed` and publicly visible. RLS
 * enforces the same rule; stating it here keeps the intent obvious and means
 * a service-role caller cannot accidentally leak drafts.
 */
export async function browseAgents<T = Record<string, unknown>>(
  db: SupabaseClient,
  c: Context
): Promise<BrowseResult<T>> {
  const params = new URL(c.req.url).searchParams;
  const { from, to, page, perPage } = readPagination(c, 24);

  let query = db
    .from("marketplace_agents")
    .select(BROWSE_COLUMNS, { count: "exact" })
    .eq("status", "listed")
    .eq("visibility", "public")
    .range(from, to);

  const category = params.get("category");
  if (category && AGENT_CATEGORIES.includes(category as (typeof AGENT_CATEGORIES)[number])) {
    query = query.eq("category", category);
  }

  const search = params.get("q")?.trim();
  if (search) {
    // Escape the PostgREST `or` delimiters so a search term containing a
    // comma or parenthesis cannot alter the filter expression.
    const safe = search.replace(/[,()]/g, " ").slice(0, 100);
    query = query.or(`name.ilike.%${safe}%,tagline.ilike.%${safe}%,description.ilike.%${safe}%`);
  }

  const maxPrice = Number(params.get("max_price"));
  if (Number.isFinite(maxPrice) && maxPrice >= 0) {
    query = query.lte("price_cents", Math.round(maxPrice));
  }

  if (params.get("free") === "true") query = query.eq("price_cents", 0);

  switch ((params.get("sort") ?? "popular") as BrowseSort) {
    case "newest":
      query = query.order("created_at", { ascending: false });
      break;
    case "rating":
      query = query.order("rating_avg", { ascending: false }).order("rating_count", { ascending: false });
      break;
    case "price":
      query = query.order("price_cents", { ascending: true });
      break;
    default:
      query = query
        .order("install_count", { ascending: false })
        .order("sales_count", { ascending: false });
  }

  const { data, error, count } = await query;
  if (error) throw badRequest(error.message);

  return {
    items: (data ?? []) as T[],
    meta: { total: count ?? 0, page, per_page: perPage },
  };
}
