/**
 * Site-wide configuration — the single source of truth for SEO.
 *
 * Consumed by the metadata generator, `robots.ts`, `sitemap.ts`, and the
 * JSON-LD structured-data helper. Update the placeholder values per project.
 */
import { getServerEnv, publicEnv } from "@/env";

/**
 * Vercel's production domain, read at build time — the fallback when a deploy
 * doesn't set `NEXT_PUBLIC_SITE_URL` (none did: the live canonical said
 * localhost). Server-only: every consumer of `siteConfig` renders on the server.
 */
const vercelProduction = getServerEnv().VERCEL_PROJECT_PRODUCTION_URL;

export const siteConfig = {
  name: "ASTRA",
  /**
   * The default `<title>` — the studio line, not just the name. Pages set their
   * own title and it slots into the `%s — HELION` template (see the metadata
   * generator); this is what shows on the home route and as the OG title.
   */
  title: "ASTRA — Every market, one token",
  description:
    "Tokenized stocks, crypto and memecoins, pulled into one redeemable token in your own Solana wallet. Priced live, routed for the best fill. We give markets gravity.",
  /**
   * Public origin, no trailing slash. Drives canonical URLs, OG tags, the
   * sitemap, and JSON-LD. Set `NEXT_PUBLIC_SITE_URL` in production.
   */
  url:
    publicEnv.NEXT_PUBLIC_SITE_URL ??
    (vercelProduction ? `https://${vercelProduction}` : "http://localhost:3000"),
  /** Default Open Graph / Twitter share image (path under `public/`). */
  ogImage: "/open-graph.png",
  twitterHandle: "@astra",
  author: "Astra Labs",
  /**
   * Copyright, in one place. Read by the JSON-LD `WebSite` node and by the
   * footer's baseline line — they used to state it independently, and an
   * independently-stated year is a year that goes stale in exactly one of them.
   */
  copyrightYear: 2026,
  copyrightHolder: "Astra Labs",
  /**
   * Browser theme-color. It must actually be `--background`: it paints the iOS
   * status bar and the Android toolbar, and a neutral near-black beside a
   * blue-black page reads as a seam at the top of the screen. It was `#010101`,
   * left behind when the palette moved to deep blue.
   */
  themeColor: "#02040d",
} as const;
