/**
 * @fileoverview Standardised metadata + viewport generators for pages.
 *
 * `generateMetadata` builds a Next.js `Metadata` object — basic meta tags,
 * OpenGraph, Twitter cards, canonical URL, icons, robots. `metadataBase` is
 * always set (from `siteConfig`) so relative URLs (OG image, canonical)
 * resolve to absolute — required by social scrapers.
 *
 * `generateViewport` builds the `Viewport` export. `themeColor` lives here, not
 * in `Metadata` — Next deprecated it on the metadata object.
 */

import { Metadata, Viewport } from "next";

import { siteConfig } from "@/lib/site";

interface MetadataProps {
  title?: string;
  description?: string;
  /** Canonical path (e.g. `/about`) or absolute URL for this page. */
  url?: string;
  /** Open Graph / Twitter image — path under `public/` or absolute URL. */
  ogImage?: string;
  twitterHandle?: string;
  author?: string;
  siteName?: string;
}

export function generateMetadata({
  title,
  description = siteConfig.description,
  url = "/",
  ogImage = siteConfig.ogImage,
  twitterHandle = siteConfig.twitterHandle,
  author = siteConfig.author,
  siteName = siteConfig.name,
}: MetadataProps = {}): Metadata {
  /* No page title → the studio default; a page title → slotted into the template
   * so every route ends in "— ASTRA" without each page repeating the brand. The
   * OpenGraph/Twitter titles below take the resolved string, since scrapers don't
   * apply the template. */
  const resolvedTitle = title ?? siteConfig.title;
  const metaTitle = title
    ? { default: title, template: `%s — ${siteConfig.name}` }
    : { default: siteConfig.title, template: `%s — ${siteConfig.name}` };

  return {
    // Resolves every relative URL below to an absolute one.
    metadataBase: new URL(siteConfig.url),
    title: metaTitle,
    description,
    authors: [{ name: author }],
    creator: author,
    publisher: author,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: resolvedTitle,
      description,
      url,
      siteName,
      // Dimensions must match the real asset (public/open-graph.png).
      images: [{ url: ogImage, width: 1200, height: 630 }],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description,
      site: twitterHandle,
      creator: twitterHandle,
      images: [ogImage],
    },
    /* Icons are intentionally omitted: setting `icons` here would override Next's
     * file-convention detection. The app dir owns them — `app/icon.svg` (the
     * branded mark, the primary favicon), `app/apple-icon.png`, and
     * `app/favicon.ico` (legacy) — and Next emits the correct <link> tags. */
    manifest: "/manifest.json",
    robots: {
      index: true,
      follow: true,
    },
  };
}

export function generateViewport(): Viewport {
  return {
    themeColor: siteConfig.themeColor,
    width: "device-width",
    initialScale: 1,
    // The page reaches under the home indicator, so `env(safe-area-inset-*)`
    // reports real insets — the phone menu's foot clears it (D-037).
    viewportFit: "cover",
  };
}
