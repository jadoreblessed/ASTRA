import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site";

/**
 * Generates `/robots.txt`. Allows all crawlers and points them at the sitemap.
 * Tighten the rules per environment (e.g. disallow `/` on staging).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The served forms (robot, phone) live under `/view/`; the proxy serves
      // them at the public URLs (D-016, `lib/page-forms`) — duplicates here.
      disallow: "/view/",
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
