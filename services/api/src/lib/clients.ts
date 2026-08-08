// ============================================================
// TASKPILOT API — LAZY SERVICE CLIENTS
// services/api/src/lib/clients.ts
//
// Stripe and the Supabase service-role client are constructed on first use,
// never at module scope. A top-level `new Stripe(key!)` throws the moment
// the module is imported whenever the secret is absent, which breaks builds,
// CI and any local run that doesn't carry production credentials.
//
// A missing credential surfaces as a 503 `not_configured`, not a 500: the
// deployment is incomplete, the request was not wrong.
// ============================================================

import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

import { notConfigured } from "./errors";

export const STRIPE_API_VERSION = "2024-06-20" as const;

/** The env file a developer should be editing when something is missing. */
const ENV_HINT = "Set it in services/api/.env (copy from .env.example).";

let stripeSingleton: Stripe | null = null;
let adminSingleton: SupabaseClient | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw notConfigured(`This deployment is missing ${name}. ${ENV_HINT}`);
  }
  return value;
}

/** Stripe client. Only touch this inside a request handler. */
export function getStripe(): Stripe {
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(required("STRIPE_SECRET_KEY"), {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
    });
  }
  return stripeSingleton;
}

/**
 * Service-role Supabase client — bypasses RLS. This service authenticates
 * the caller itself and then filters by user id explicitly, which is why
 * every handler must scope its own queries.
 */
export function getAdminClient(): SupabaseClient {
  if (!adminSingleton) {
    adminSingleton = createClient(
      required("SUPABASE_URL"),
      required("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: { persistSession: false, autoRefreshToken: false },
        // supabase-js builds a Realtime client eagerly, and Realtime needs a
        // global WebSocket. Node did not ship one until 22, so on Node 20 —
        // which this project supports and CI runs — construction throws and
        // EVERY database call fails, including sign-up. The error names
        // Realtime, which is misleading: nothing here subscribes to it.
        //
        // Supplying a transport satisfies the constructor. No connection is
        // opened unless a channel is actually subscribed to, so this costs
        // nothing at runtime.
        realtime: { transport: WebSocket as unknown as never },
      }
    );
  }
  return adminSingleton;
}

/** True when the deployment has the credentials a feature needs. */
export function hasStripeCredentials(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function hasSupabaseCredentials(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Test seam: forces the next call to rebuild from current env. */
export function resetClients(): void {
  stripeSingleton = null;
  adminSingleton = null;
}
