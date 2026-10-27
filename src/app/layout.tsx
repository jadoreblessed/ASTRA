import type { Metadata, Viewport } from "next";

import {
  generateMetadata,
  generateViewport,
} from "@/utils/seo/generate-page-metadata";
import { getSiteStructuredData } from "@/utils/seo/structured-data";

import { ReducedMotion } from "@/components/common/reduced-motion";
import { ScrollLayout } from "@/layouts/scroll-layout";
import { geistMono, gilroy, lato, mulish } from "@/lib/fonts";

import "@/app/globals.css";

export const metadata: Metadata = generateMetadata();
export const viewport: Viewport = generateViewport();

/**
 * Two starter features are deliberately absent, because the original helios site
 * has neither and both are visible on screen:
 *
 * - `<AdaptiveGrid>` scales the root font-size above 1920px; helios was laid out
 *   in fixed px with `vw` title overrides. See decisions-log ADR-0015.
 * - `<LazyCookie>` renders a consent banner over the hero. Restore by importing
 *   it from `@/components/common/Cookie` and rendering it inside `ScrollLayout`.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${gilroy.variable} ${lato.variable} ${mulish.variable} ${geistMono.variable} font-sans`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(getSiteStructuredData()),
          }}
        />
        <ScrollLayout>
          <ReducedMotion />
          {children}
        </ScrollLayout>
      </body>
    </html>
  );
}
