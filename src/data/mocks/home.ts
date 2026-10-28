import { screens } from "@/lib/scene/screens";
import { siteConfig } from "@/lib/site";

/**
 * Placeholder content for the home view, ported from the original helios
 * components. Components take this via props — never by importing it directly.
 */

export interface HeroFormContent {
  /** The contract chip: its label and what it reads until the mint is live. */
  caLabel: string;
  ca: string;
  xLabel: string;
  xHref: string;
}

/** An asset riding the hero orbit, drawn as its logo coin. */
export interface OrbitAsset {
  symbol: string;
  /** Glyph key for `AssetLogo`; omitted for a lettered coin. */
  logo?: string;
  mark?: string;
}

export interface HeroContent {
  /** Masthead top line — the white → haze half of the mirrored gradient. */
  titleTop: string;
  /** Masthead bottom line — the haze → white half. */
  titleBottom: string;
  subtitle: string;
  /** The one token at the centre of the orbit. */
  token: { symbol: string };
  /** Every market, in orbit around it — the wide ring and the tight one. */
  orbit: { outer: OrbitAsset[]; inner: OrbitAsset[] };
  form: HeroFormContent;
}

const form: HeroFormContent = {
  caLabel: "CA",
  ca: "Coming soon",
  xLabel: "ASTRA on X",
  xHref: "https://x.com/astra",
};

export const hero: HeroContent = {
  titleTop: "Every market.",
  titleBottom: "Pulled into one.",
  subtitle:
    "Tokenized stocks, crypto and memecoins — one token you hold and redeem in your own wallet. Gravity does the rest.",
  token: { symbol: "$ASTRA" },
  orbit: {
    outer: [
      { symbol: "NVDAx", logo: "nvidia" },
      { symbol: "wBTC", logo: "bitcoin" },
      { symbol: "AAPLx", logo: "apple" },
      { symbol: "SOL", logo: "solana" },
      { symbol: "GOOGLx", logo: "google" },
      { symbol: "TSLAx", logo: "tesla" },
      { symbol: "ETH", logo: "ethereum" },
      { symbol: "METAx", logo: "meta" },
    ],
    inner: [
      { symbol: "ANTHx", logo: "anthropic" },
      { symbol: "BONK" },
      { symbol: "AMDx", logo: "amd" },
      { symbol: "WIF" },
      { symbol: "SPYx", mark: "S&P" },
    ],
  },
  form,
};

export interface HeroNavContent {
  /** Accessible name for the logo home control. */
  wordmark: string;
  links: NavItem[];
  ctaLabel: string;
}

/**
 * Top navigation for the getLayers hero redesign (Figma 665:1694). Replaces the
 * original fixed `Header` on the home view. The link labels are the design's;
 * their targets map onto the existing case-study sections.
 */
export const heroNav: HeroNavContent = {
  wordmark: "Astra",
  links: [
    { label: "Home", target: screens.HERO },
    { label: "Baskets", target: screens.SITEMAP },
    { label: "How it works", target: screens.ROADMAP },
    { label: "Proof", target: screens.IMPACT },
  ],
  ctaLabel: "Open the app",
};

export interface ServiceItem {
  title: string;
  caption: string;
  /** The count-up readout over the title: value, suffix, unit. */
  stat: { value: number; suffix: string; unit: string };
  /** What's actually inside, as logo coins — the first `show` on screen, the
   *  rest cycling through those slots. */
  logos: OrbitAsset[];
  show: number;
}

export interface ServicesContent {
  /** Masthead top line — white → haze half of the mirrored gradient. */
  titleTop: string;
  /** Masthead bottom line — haze → white half. */
  titleBottom: string;
  /** Left-hand feature column (left-aligned). */
  left: ServiceItem[];
  /** Right-hand feature column (right-aligned). */
  right: ServiceItem[];
  footnote: string;
}

/**
 * Services section — the getLayers redesign of the second slide (Figma
 * 668:1825). A two-line masthead over a four-cell feature grid (two columns of
 * two), footed by a centred line of copy.
 */
export const services: ServicesContent = {
  titleTop: "Tokenized.",
  titleBottom: "Held as one.",
  left: [
    {
      title: "Stocks",
      caption: "Built to hold",
      stat: { value: 62, suffix: "", unit: "listed" },
      show: 5,
      logos: [
        { symbol: "NVDAx", logo: "nvidia" },
        { symbol: "AAPLx", logo: "apple" },
        { symbol: "GOOGLx", logo: "google" },
        { symbol: "TSLAx", logo: "tesla" },
        { symbol: "METAx", logo: "meta" },
        { symbol: "NFLXx", logo: "netflix" },
        { symbol: "PLTRx", logo: "palantir" },
        { symbol: "HOODx", logo: "robinhood" },
        { symbol: "SPOTx", logo: "spotify" },
        { symbol: "AVGOx", logo: "broadcom" },
        { symbol: "ABNBx", logo: "airbnb" },
        { symbol: "PYPLx", logo: "paypal" },
        { symbol: "SHOPx", logo: "shopify" },
      ],
    },
    {
      title: "Memecoins",
      caption: "The whole meta",
      stat: { value: 30, suffix: "", unit: "listed" },
      show: 4,
      logos: [
        { symbol: "BONK" },
        { symbol: "WIF" },
        { symbol: "POPCAT" },
        { symbol: "FARTCOIN" },
        { symbol: "PNUT" },
        { symbol: "MEW" },
        { symbol: "GIGA" },
        { symbol: "MOODENG" },
        { symbol: "PENGU" },
        { symbol: "DOGE", logo: "dogecoin" },
      ],
    },
  ],
  right: [
    {
      title: "Crypto",
      caption: "Always on",
      stat: { value: 41, suffix: "", unit: "listed" },
      show: 4,
      logos: [
        { symbol: "wBTC", logo: "bitcoin" },
        { symbol: "SOL", logo: "solana" },
        { symbol: "ETH", logo: "ethereum" },
        { symbol: "COINx", logo: "coinbase" },
        { symbol: "LINK", logo: "chainlink" },
        { symbol: "XRP", logo: "xrp" },
        { symbol: "SUI", logo: "sui" },
        { symbol: "TON", logo: "ton" },
        { symbol: "LTC", logo: "litecoin" },
        { symbol: "ADA", logo: "cardano" },
        { symbol: "BNB", logo: "binance" },
      ],
    },
    {
      title: "Redeemable",
      caption: "Any time",
      stat: { value: 24, suffix: "/7", unit: "redemption" },
      show: 3,
      logos: [
        { symbol: "SPYx", mark: "S&P" },
        { symbol: "ANTHx", logo: "anthropic" },
        { symbol: "AMDx", logo: "amd" },
        { symbol: "QQQx", mark: "QQQ" },
        { symbol: "NVDAx", logo: "nvidia" },
        { symbol: "wBTC", logo: "bitcoin" },
        { symbol: "BONK" },
        { symbol: "AAPLx", logo: "apple" },
      ],
    },
  ],
  footnote:
    "We pull stocks, crypto and memecoins into a single token you can hold, send and redeem — priced live, routed for the best fill, yours on-chain.",
};

/** One end of a step's little diagram: a stack of coins, or the $ASTRA planet. */
export type FlowNode = { logos: OrbitAsset[]; more?: number } | "planet";

export interface TimelineStep {
  /** Two-digit index, e.g. "01". */
  index: string;
  title: string;
  body: string;
  /** The hard fact under the step. */
  meta: string;
  /** What the step does, drawn as coins with arrows between: from → to. */
  flow: FlowNode[];
}

export interface TimelineContent {
  /** Masthead top line — white → haze half of the mirrored gradient. */
  titleTop: string;
  /** Masthead bottom line — haze → white half. */
  titleBottom: string;
  steps: TimelineStep[];
}

/**
 * Timeline section — the getLayers redesign of the third slide (Figma 669:1927):
 * the studio's engagement as a horizontal rail that scrolls right-to-left across
 * the whole scene. The copy is written to follow on from the hero ("give brands
 * gravity") and services (Identity / Motion / Art Direction / Web).
 */
export const timeline: TimelineContent = {
  titleTop: "From many",
  titleBottom: "to one.",
  steps: [
    {
      index: "01",
      title: "Log in",
      body: "Email makes you a Solana wallet, keys yours to export. Phantom and Solflare work too.",
      meta: "Email → wallet in ~3s",
      flow: [{ logos: [{ symbol: "Email", logo: "gmail" }] }, { logos: [{ symbol: "SOL", logo: "solana" }] }],
    },
    {
      index: "02",
      title: "Pick",
      body: "Choose a ready basket or build your own from 133 stocks, cryptos and memecoins.",
      meta: "Up to 14 of 133 assets",
      flow: [{ logos: [{ symbol: "NVDAx", logo: "nvidia" }, { symbol: "AAPLx", logo: "apple" }, { symbol: "wBTC", logo: "bitcoin" }, { symbol: "ETH", logo: "ethereum" }, { symbol: "BONK" }, { symbol: "TSLAx", logo: "tesla" }], more: 127 }],
    },
    {
      index: "03",
      title: "Pay",
      body: "USDC or SOL. Every swap is price-limited and routed for the best on-chain fill.",
      meta: "USDC or SOL · price-limited",
      flow: [{ logos: [{ symbol: "USDC", logo: "usdc" }, { symbol: "SOL", logo: "solana" }] }, { logos: [{ symbol: "NVDAx", logo: "nvidia" }, { symbol: "wBTC", logo: "bitcoin" }, { symbol: "BONK" }, { symbol: "GOOGLx", logo: "google" }] }],
    },
    {
      index: "04",
      title: "Hold",
      body: "One token in your own wallet — send it or hold it like any other asset.",
      meta: "One token · your wallet",
      flow: [{ logos: [{ symbol: "NVDAx", logo: "nvidia" }, { symbol: "wBTC", logo: "bitcoin" }, { symbol: "ETH", logo: "ethereum" }, { symbol: "BONK" }, { symbol: "AAPLx", logo: "apple" }] }, "planet"],
    },
    {
      index: "05",
      title: "Redeem",
      body: "Burn the share, get the exact tokens back. Nobody can switch it off.",
      meta: "Burn → exact tokens back",
      flow: ["planet", { logos: [{ symbol: "NVDAx", logo: "nvidia" }, { symbol: "wBTC", logo: "bitcoin" }, { symbol: "WIF" }, { symbol: "AAPLx", logo: "apple" }] }],
    },
  ],
};

export interface SitemapChapter {
  number: string;
  title: string;
  subtitle: string;
  target: string;
}

export interface SitemapContent {
  eyebrow: string;
  heading: string;
  ctaLabel: string;
  /** Grouped exactly as the original: one, then two, then two. */
  rows: SitemapChapter[][];
}

export const sitemap: SitemapContent = {
  eyebrow: "Baskets",
  heading: "Baskets you can hold today.",
  ctaLabel: "Open the app →",
  rows: [
    [
      {
        number: "01",
        title: "AI Supercycle",
        subtitle: "GOOGLx, AVGOx, NVDAx and more",
        target: screens.ROADMAP,
      },
    ],
    [
      {
        number: "02",
        title: "Onchain 80/20",
        subtitle: "US equities against bitcoin",
        target: screens.PARTNERS,
      },
      {
        number: "03",
        title: "Vision",
        subtitle: "wBTC, SOL and Anthropic",
        target: screens.PRODUCT,
      },
    ],
    [
      {
        number: "04",
        title: "Build your own",
        subtitle: "Up to 14 of 133 assets",
        target: screens.INVESTORS,
      },
      {
        number: "05",
        title: "Single tokens",
        subtitle: "133 listed, $ASTRA included",
        target: screens.SOCIAL,
      },
    ],
  ],
};

export interface BriefPhase {
  num: string;
  kicker: string;
  heading: string;
  body: string;
}

export interface BriefContent {
  chapter: string;
  phases: BriefPhase[];
}

export const brief: BriefContent = {
  chapter: "01 · Flow",
  phases: [
    {
      num: "01",
      kicker: "Approve",
      heading: "One slide, two approvals",
      body: "You check the transaction and slide to sign — one approval for the swaps, one for the mint, and only ever for ASTRA's own program on Solana.",
    },
    {
      num: "02",
      kicker: "Route",
      heading: "Best price on every swap",
      body: "Each swap is routed for the best on-chain fill and price-limited against a live quote. Miss the limit and nothing mints; the tokens already bought stay yours.",
    },
    {
      num: "03",
      kicker: "Settle",
      heading: "One token, in your wallet",
      body: "Your basket shares land in your own wallet in under a second. Redeem for the exact tokens inside at any time — nobody can switch it off.",
    },
  ],
};

export interface ImpactMetric {
  value: string;
  suffix?: string;
  label: string;
}

export interface ImpactContent {
  chapter: string;
  heading: string;
  metrics: ImpactMetric[];
  foot: string;
}

export const impact: ImpactContent = {
  chapter: "02 · Proof",
  heading: "Measured on-chain, not promised.",
  metrics: [
    {
      value: "100",
      suffix: "%",
      label: "Redeemable — nobody can switch it off",
    },
    {
      value: ">10",
      suffix: "%",
      label: "Of $ASTRA supply already burned",
    },
    {
      value: "133",
      suffix: " assets",
      label: "Stocks, crypto and memecoins listed",
    },
  ],
  foot: "Every basket priced live, routed for the best on-chain fill, and yours to redeem.",
};

/**
 * Logo scene (fourth slide) — the same hero composition, reused as the payoff:
 * a two-line mirrored-gradient masthead and a subtitle framing the particle mark
 * as it assembles. No contact form here — the mark is the closing statement.
 */
/** A proof readout flanking the assembling token: prefix + count-up + suffix. */
export interface ProofStat {
  index: string;
  prefix: string;
  value: number;
  suffix: string;
  label: string;
  /** The coins the proof is about, under its line. */
  logos?: OrbitAsset[];
  more?: number;
}

export interface LogoSceneContent {
  /** Masthead top line — the white → haze half of the mirrored gradient. */
  titleTop: string;
  /** Masthead bottom line — the haze → white half. */
  titleBottom: string;
  subtitle: string;
  /** The proofs, read as one line under the planet. */
  left: ProofStat[];
  right: ProofStat[];
  /** The word set huge behind the planet, in outline. */
  word: string;
  /** Everything a basket can hold, running past along the foot. */
  ticker: OrbitAsset[];
}

export const logoScene: LogoSceneContent = {
  titleTop: "The whole market.",
  titleBottom: "In one token.",
  subtitle:
    "Every market pulled into a single token — held and redeemed in your own wallet.",
  left: [
    { index: "01", prefix: "", value: 100, suffix: "%", label: "Redeemable — nobody can switch it off", logos: [{ symbol: "NVDAx", logo: "nvidia" }, { symbol: "wBTC", logo: "bitcoin" }, { symbol: "BONK" }, { symbol: "AAPLx", logo: "apple" }] },
    { index: "02", prefix: ">", value: 10, suffix: "%", label: "Of $ASTRA supply already burned" },
  ],
  right: [
    { index: "03", prefix: "", value: 133, suffix: "", label: "Stocks, crypto and memecoins listed", logos: [{ symbol: "TSLAx", logo: "tesla" }, { symbol: "SOL", logo: "solana" }, { symbol: "GOOGLx", logo: "google" }, { symbol: "ETH", logo: "ethereum" }, { symbol: "WIF" }], more: 128 },
    { index: "04", prefix: "<", value: 2, suffix: " min", label: "Price freshness — or no trade" },
  ],
  word: "ONE TOKEN",
  ticker: [
    { symbol: "NVDAx", logo: "nvidia" },
    { symbol: "wBTC", logo: "bitcoin" },
    { symbol: "BONK" },
    { symbol: "AAPLx", logo: "apple" },
    { symbol: "SOL", logo: "solana" },
    { symbol: "TSLAx", logo: "tesla" },
    { symbol: "WIF" },
    { symbol: "SPYx", mark: "S&P" },
    { symbol: "ETH", logo: "ethereum" },
    { symbol: "GOOGLx", logo: "google" },
    { symbol: "POPCAT" },
    { symbol: "METAx", logo: "meta" },
    { symbol: "PENGU" },
    { symbol: "AMDx", logo: "amd" },
    { symbol: "JUP" },
    { symbol: "NFLXx", logo: "netflix" },
    { symbol: "FARTCOIN" },
    { symbol: "PLTRx", logo: "palantir" },
    { symbol: "TRUMP" },
    { symbol: "COINx", logo: "coinbase" },
    { symbol: "PYTH" },
    { symbol: "HOODx", logo: "robinhood" },
    { symbol: "MOODENG" },
    { symbol: "QQQx", mark: "QQQ" },
  ],
};

export interface NavItem {
  label: string;
  target: string;
}

export interface SocialLink {
  label: string;
  href: string;
}

export interface FooterContent {
  wordmark: string;
  tagline: string;
  ctaLabel: string;
  ctaHref: string;
  nav: NavItem[];
  social: SocialLink[];
  copy: string;
}

export const footer: FooterContent = {
  wordmark: "ASTRA",
  tagline: "We give markets gravity — every market, in one token.",
  ctaLabel: "Open the app",
  ctaHref: "/app",
  nav: [
    { label: "Baskets", target: screens.SITEMAP },
    { label: "How it works", target: screens.ROADMAP },
    { label: "Proof", target: screens.IMPACT },
  ],
  social: [
    { label: "Email", href: "mailto:hello@astra.xyz" },
    { label: "Twitter", href: "https://twitter.com" },
    { label: "Telegram", href: "https://telegram.org" },
  ],
  /* The year and the holder come from `siteConfig`, which is also what the
   * JSON-LD `WebSite` node states — a footer that claims a different year to the
   * structured data is the sort of thing nobody notices for two years. */
  copy: `© ${siteConfig.copyrightYear} ${siteConfig.copyrightHolder} — All rights reserved`,
};

export interface HeaderContent {
  wordmark: string;
  navLabel: string;
  ctaLabel: string;
}

export const header: HeaderContent = {
  wordmark: "ASTRA",
  navLabel: "Baskets",
  ctaLabel: "Open the app",
};

export interface MenuContent {
  eyebrow: string;
  ctaLabel: string;
  links: NavItem[];
}

/** Chapter labels shown in the mobile menu, from the original `section_links`. */
export const menu: MenuContent = {
  eyebrow: "Baskets",
  ctaLabel: "Open the app",
  links: [
    { label: "AI Supercycle", target: screens.ROADMAP },
    { label: "Onchain 80/20", target: screens.PARTNERS },
    { label: "Vision", target: screens.PRODUCT },
    { label: "Build your own", target: screens.INVESTORS },
    { label: "Single tokens", target: screens.SOCIAL },
  ],
};
