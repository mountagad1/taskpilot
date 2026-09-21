import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { listAgents } from "@/lib/server-api";

// Static public routes only — /dashboard/* and /auth/* are excluded from
// the sitemap for the same reason they're disallowed in robots.ts: no SEO
// value behind sign-in.
const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/marketplace", changeFrequency: "daily", priority: 0.9 },
  { path: "/changelog", changeFrequency: "weekly", priority: 0.6 },
  { path: "/roadmap", changeFrequency: "weekly", priority: 0.5 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/security", changeFrequency: "monthly", priority: 0.4 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.4 },
  { path: "/careers", changeFrequency: "monthly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // listAgents() already degrades to [] if the API is unreachable — the
  // sitemap build must never fail just because the backend is briefly down.
  const agents = await listAgents();
  const agentEntries: MetadataRoute.Sitemap = agents.map((agent) => ({
    url: `${SITE_URL}/marketplace/${agent.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...agentEntries];
}
