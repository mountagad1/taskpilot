// ============================================================
// TASKPILOT API — SERVER ENTRY
// services/api/src/server.ts
// ============================================================

import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { hasSupabaseCredentials, hasStripeCredentials } from "./lib/clients";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`TaskPilot API listening on http://localhost:${info.port}`);
  console.log(`  health    http://localhost:${info.port}/health`);
  console.log(`  discovery http://localhost:${info.port}/v1`);

  // Say plainly which capabilities are live. A missing key degrades a
  // feature rather than breaking the service, so this is the only signal a
  // developer gets that something is switched off.
  const status = [
    ["database", hasSupabaseCredentials()],
    ["billing", hasStripeCredentials()],
    ["ai", Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY)],
    ["worker", Boolean(process.env.WORKER_SECRET)],
    ["redis", Boolean(process.env.UPSTASH_REDIS_REST_URL)],
  ] as const;

  const off = status.filter(([, on]) => !on).map(([name]) => name);
  if (off.length) {
    console.log(`\n  not configured: ${off.join(", ")}`);
    console.log("  (those features return 503; everything else works)\n");
  }
});

// Let an orchestrator stop the process cleanly rather than killing in-flight
// requests.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} received, shutting down...`);
    server.close(() => process.exit(0));
  });
}
