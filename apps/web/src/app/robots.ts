import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// The dashboard and auth flows have no SEO value — they're a private app
// shell behind sign-in — and being crawlable only spends crawl budget on
// 17 URLs with nothing indexable behind them. Disallowing them here is the
// crawl-time half of that; layout.tsx-level `robots: { index: false }` on
// those two route groups is the index-time half, since a Disallow stops a
// crawl but doesn't retract a URL that's already indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/auth/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
