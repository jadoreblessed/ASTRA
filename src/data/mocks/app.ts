/**
 * Content for the product app (`/app`) — modelled on the reference app's
 * Explore / Assets / basket / Create screens, with ASTRA's own catalogue.
 * Mock data only: no wallet is connected and no order is placed; every figure is
 * illustrative. Components take this via props.
 */

export type AssetKind = "stock" | "crypto" | "meme";

export interface Asset {
  /** Tokenized ticker, e.g. "NVDAx". */
  symbol: string;
  name: string;
  kind: AssetKind;
  /** Glyph key for `AssetLogo`; omitted for lettered coins. */
  logo?: string;
  /** Lettered-coin mark, e.g. "S&P". */
  mark?: string;
  price: number;
  /** 24h change, percent. */
  change: number;
  mcap: string;
  volume: string;
  holders: number;
  /** How many live baskets hold it. */
  baskets: number;
}

export interface Holding {
  symbol: string;
  /** Share of the basket, percent; a basket's weights sum to 100. */
  weight: number;
}

export interface Basket {
  id: string;
  /** Ticker of the basket's share token, e.g. "AISC". */
  code: string;
  name: string;
  description: string;
  price: number;
  change: number;
  tvl: string;
  holders: number;
  created: string;
  rebalance: string;
  holdings: Holding[];
  /** 90 daily closes, oldest first — drives the sparkline and the chart. */
  history: number[];
}

export interface AppStat {
  label: string;
  value: number;
  prefix: string;
  suffix: string;
}

export interface AppContent {
  title: { top: string; bottom: string };
  subtitle: string;
  stats: AppStat[];
  token: { symbol: string; note: string; caLabel: string; ca: string };
  kinds: Record<AssetKind, { label: string; color: string }>;
  assets: Asset[];
  baskets: Basket[];
}

/** A deterministic random walk — SSR and the client draw the same chart. */
const walk = (seed: number, end: number, trend: number, n = 90): number[] => {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const out: number[] = [];
  let v = 1;
  for (let i = 0; i < n; i++) {
    v *= 1 + (rand() - 0.5) * 0.045 + trend / n;
    out.push(v);
  }
  const k = end / out[out.length - 1];
  return out.map((x) => +(x * k).toFixed(2));
};

export const app: AppContent = {
  title: { top: "Every basket,", bottom: "priced live." },
  subtitle:
    "Stocks, crypto and memecoins in one token, priced live from what each basket holds. Buy one with USDC or SOL, or build your own.",
  stats: [
    { label: "Value locked", value: 2.41, prefix: "$", suffix: "M" },
    { label: "Baskets", value: 6, prefix: "", suffix: "" },
    { label: "Holders", value: 9620, prefix: "", suffix: "" },
  ],
  token: {
    symbol: "$ASTRA",
    note: "Buyback & burn",
    caLabel: "CA",
    ca: "Coming soon",
  },
  kinds: {
    stock: { label: "Equity", color: "#6d8bff" },
    crypto: { label: "Crypto", color: "#d2bdff" },
    meme: { label: "Memecoin", color: "#ff8fc4" },
  },
  assets: [
    { symbol: "NVDAx", name: "NVIDIA", kind: "stock", logo: "nvidia", price: 182.4, change: 2.4, mcap: "$94.2M", volume: "$3.1M", holders: 41820, baskets: 3 },
    { symbol: "AAPLx", name: "Apple", kind: "stock", logo: "apple", price: 232.1, change: 0.6, mcap: "$53.3M", volume: "$1.5M", holders: 43010, baskets: 1 },
    { symbol: "GOOGLx", name: "Alphabet", kind: "stock", logo: "google", price: 198.3, change: -0.7, mcap: "$38.9M", volume: "$1.1M", holders: 22740, baskets: 2 },
    { symbol: "AVGOx", name: "Broadcom", kind: "stock", logo: "broadcom", price: 341.2, change: 1.8, mcap: "$12.4M", volume: "$402K", holders: 8910, baskets: 1 },
    { symbol: "AMDx", name: "AMD", kind: "stock", logo: "amd", price: 168.9, change: 3.1, mcap: "$9.8M", volume: "$275K", holders: 4820, baskets: 1 },
    { symbol: "METAx", name: "Meta", kind: "stock", logo: "meta", price: 712.5, change: 0.9, mcap: "$21.6M", volume: "$640K", holders: 11230, baskets: 2 },
    { symbol: "TSLAx", name: "Tesla", kind: "stock", logo: "tesla", price: 248.7, change: -1.6, mcap: "$44.1M", volume: "$2.2M", holders: 38560, baskets: 1 },
    { symbol: "PLTRx", name: "Palantir", kind: "stock", logo: "palantir", price: 156.2, change: 4.2, mcap: "$7.3M", volume: "$318K", holders: 6140, baskets: 1 },
    { symbol: "NFLXx", name: "Netflix", kind: "stock", logo: "netflix", price: 1210.3, change: -0.4, mcap: "$5.9M", volume: "$188K", holders: 3270, baskets: 1 },
    { symbol: "COINx", name: "Coinbase", kind: "stock", logo: "coinbase", price: 318.4, change: 2.2, mcap: "$8.7M", volume: "$290K", holders: 5410, baskets: 1 },
    { symbol: "HOODx", name: "Robinhood", kind: "stock", logo: "robinhood", price: 118.6, change: 5.1, mcap: "$6.2M", volume: "$355K", holders: 4980, baskets: 1 },
    { symbol: "SPYx", name: "S&P 500", kind: "stock", mark: "S&P", price: 668.2, change: 0.4, mcap: "$71.8M", volume: "$2.8M", holders: 29400, baskets: 1 },
    { symbol: "ANTHx", name: "Anthropic", kind: "stock", logo: "anthropic", price: 412.0, change: 1.4, mcap: "$18.2M", volume: "$720K", holders: 12880, baskets: 1 },
    { symbol: "wBTC", name: "Bitcoin", kind: "crypto", logo: "bitcoin", price: 112430, change: 1.2, mcap: "$412M", volume: "$18.4M", holders: 96200, baskets: 2 },
    { symbol: "SOL", name: "Solana", kind: "crypto", logo: "solana", price: 196.8, change: 3.1, mcap: "$1.1B", volume: "$42.7M", holders: 410200, baskets: 2 },
    { symbol: "ETH", name: "Ethereum", kind: "crypto", logo: "ethereum", price: 4210.5, change: 0.8, mcap: "$264M", volume: "$9.6M", holders: 58300, baskets: 1 },
    { symbol: "BONK", name: "Bonk", kind: "meme", price: 0.0000231, change: -1.8, mcap: "$1.8B", volume: "$64.2M", holders: 912400, baskets: 1 },
    { symbol: "WIF", name: "dogwifhat", kind: "meme", price: 1.84, change: 5.3, mcap: "$1.8B", volume: "$118M", holders: 214900, baskets: 1 },
    { symbol: "POPCAT", name: "Popcat", kind: "meme", price: 0.412, change: -2.4, mcap: "$404M", volume: "$22.1M", holders: 98100, baskets: 1 },
    { symbol: "FARTCOIN", name: "Fartcoin", kind: "meme", price: 1.12, change: 7.9, mcap: "$1.1B", volume: "$96.4M", holders: 72600, baskets: 1 },
  ],
  baskets: [
    {
      id: "ai-supercycle",
      code: "AISC",
      name: "AI Supercycle",
      description: "The names building the compute buildout, chips to models.",
      price: 1042.6,
      change: 4.2,
      tvl: "$612.4K",
      holders: 1284,
      created: "Oct 14",
      rebalance: "Every 30 days or 5% drift",
      holdings: [
        { symbol: "NVDAx", weight: 24 },
        { symbol: "AVGOx", weight: 18 },
        { symbol: "GOOGLx", weight: 16 },
        { symbol: "AMDx", weight: 14 },
        { symbol: "METAx", weight: 14 },
        { symbol: "PLTRx", weight: 14 },
      ],
      history: walk(11, 1042.6, 0.34),
    },
    {
      id: "onchain-80-20",
      code: "8020",
      name: "Onchain 80/20",
      description: "US equities against bitcoin, eighty to twenty.",
      price: 986.1,
      change: 1.1,
      tvl: "$1.21M",
      holders: 2047,
      created: "Oct 14",
      rebalance: "Every 7 days",
      holdings: [
        { symbol: "SPYx", weight: 80 },
        { symbol: "wBTC", weight: 20 },
      ],
      history: walk(29, 986.1, 0.12),
    },
    {
      id: "vision",
      code: "VIS",
      name: "Vision",
      description: "Bitcoin, Solana and pre-IPO Anthropic — the frontier.",
      price: 1318.8,
      change: 6.8,
      tvl: "$384.9K",
      holders: 836,
      created: "Oct 16",
      rebalance: "Every 30 days",
      holdings: [
        { symbol: "wBTC", weight: 34 },
        { symbol: "SOL", weight: 26 },
        { symbol: "ANTHx", weight: 22 },
        { symbol: "NVDAx", weight: 18 },
      ],
      history: walk(47, 1318.8, 0.52),
    },
    {
      id: "meme-index",
      code: "MEME",
      name: "Meme Index",
      description: "The Solana meta in one bag — rebalanced so no dog runs away.",
      price: 214.3,
      change: 9.4,
      tvl: "$96.2K",
      holders: 3410,
      created: "Oct 19",
      rebalance: "Every 7 days or 10% drift",
      holdings: [
        { symbol: "BONK", weight: 30 },
        { symbol: "WIF", weight: 30 },
        { symbol: "POPCAT", weight: 20 },
        { symbol: "FARTCOIN", weight: 20 },
      ],
      history: walk(83, 214.3, 0.9),
    },
    {
      id: "fintech-rails",
      code: "RAIL",
      name: "Fintech Rails",
      description: "The on-ramps and the chains they settle on.",
      price: 512.7,
      change: 2.9,
      tvl: "$228.1K",
      holders: 612,
      created: "Oct 21",
      rebalance: "Every 30 days",
      holdings: [
        { symbol: "COINx", weight: 30 },
        { symbol: "HOODx", weight: 25 },
        { symbol: "SOL", weight: 25 },
        { symbol: "ETH", weight: 20 },
      ],
      history: walk(101, 512.7, 0.28),
    },
    {
      id: "big-tech",
      code: "MAG",
      name: "Big Tech",
      description: "Five megacaps, equal parts, one token.",
      price: 887.4,
      change: -0.3,
      tvl: "$154.7K",
      holders: 441,
      created: "Oct 22",
      rebalance: "Every 90 days",
      holdings: [
        { symbol: "AAPLx", weight: 20 },
        { symbol: "GOOGLx", weight: 20 },
        { symbol: "METAx", weight: 20 },
        { symbol: "NFLXx", weight: 20 },
        { symbol: "TSLAx", weight: 20 },
      ],
      history: walk(131, 887.4, 0.06),
    },
  ],
};

/** Look an asset up by ticker. */
export const assetBySymbol = (symbol: string): Asset | undefined =>
  app.assets.find((a) => a.symbol === symbol);

/** Format a price at the precision its size needs. */
export const formatPrice = (v: number): string => {
  if (v >= 1000) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toPrecision(3)}`;
};
