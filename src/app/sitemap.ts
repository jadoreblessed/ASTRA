import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site";
import { sectionRoutes } from "@/lib/scene/screens";

/**
 * Generates `/sitemap.xml` — the home route plus every section deep-link,
 * derived from the same map the `[section]` route builds its params from.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: siteConfig.url,
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
    ...Object.keys(sectionRoutes).map((section) => ({
      url: `${siteConfig.url}/${section}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    {
      url: `${siteConfig.url}/privacy-policy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
