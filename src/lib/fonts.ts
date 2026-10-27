import localFont from "next/font/local";
import { Geist_Mono, Mulish } from "next/font/google";

/**
 * Gilroy + Lato, self-hosted from `public/fonts` — the original helios pairing.
 * Gilroy sets headings and body copy; Lato sets button labels.
 *
 * WOFF2 only, subset to the Latin range with every OpenType feature kept. The
 * WOFF copies were listed as separate sources, so `next/font` declared and
 * preloaded both formats — 1.55 MB of fonts on the wire before this (every
 * browser that runs this site reads WOFF2; nothing ever used the WOFF).
 */

/**
 * Mulish — the getLayers hero redesign's single typeface (Figma node 665:1694).
 * The masthead is set in Light (300); the nav, subtitle, and contact form in
 * Regular (400). Loaded and self-hosted at build via `next/font/google`, so it
 * ships with the same zero-layout-shift guarantees as the local faces above.
 */
export const mulish = Mulish({
  variable: "--font-mulish",
  subsets: ["latin"],
  weight: ["300", "400"],
  display: "swap",
});

/**
 * Geist Mono — the technical voice: bracketed labels, tickers, live readouts and
 * every number. Mulish stays the display face; this is the data under it.
 */
export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const gilroy = localFont({
  variable: "--font-gilroy",
  display: "swap",
  src: [
    {
      path: "../../public/fonts/Gilroy-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/Gilroy-Medium.woff2",
      weight: "500",
      style: "normal",
    },
  ],
});

/**
 * Not preloaded: Lato sets only components the live page no longer renders
 * (header, footer, menu, the old sitemap/impact/brief), so nothing ever asks for
 * it — yet the preload put 116 KB at High priority in front of a phone's first
 * paint. A face that is used is still fetched on first use.
 */
export const lato = localFont({
  variable: "--font-lato",
  display: "swap",
  preload: false,
  src: [
    {
      path: "../../public/fonts/Lato-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/Lato-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../public/fonts/Lato-ExtraBold.woff2",
      weight: "800",
      style: "normal",
    },
  ],
});
