/**
 * What ASTRA lists, and the curated baskets it ships with.
 *
 * Tokens are identified by mint, never by symbol: symbols collide on Solana. A
 * `mint` here is pinned; anything without one is resolved by the worker against
 * Jupiter's token list — exact symbol, verified only, the most liquid match —
 * and stays unlisted until that succeeds. Tokenized stocks are Backed's xStocks.
 *
 * `logo` is a glyph key the website draws (Simple Icons); `mark` a short label
 * for a lettered coin.
 */

export type Kind = "stock" | "crypto" | "meme";

export interface CatalogAsset {
  symbol: string;
  name: string;
  kind: Kind;
  logo?: string;
  mark?: string;
  /** Pinned mint. Omit to resolve by symbol. */
  mint?: string;
}

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOL_MINT = "So11111111111111111111111111111111111111112";

const stock = (symbol: string, name: string, logo?: string, mark?: string): CatalogAsset => ({ symbol, name, kind: "stock", logo, mark });

export const CATALOG: CatalogAsset[] = [
  // ------------------------------------------------------------- tokenized stocks (xStocks)
  stock("NVDAx", "NVIDIA", "nvidia"),
  stock("AAPLx", "Apple", "apple"),
  stock("GOOGLx", "Alphabet", "google"),
  stock("AVGOx", "Broadcom", "broadcom"),
  stock("AMDx", "AMD", "amd"),
  stock("METAx", "Meta", "meta"),
  stock("TSLAx", "Tesla", "tesla"),
  stock("PLTRx", "Palantir", "palantir"),
  stock("NFLXx", "Netflix", "netflix"),
  stock("COINx", "Coinbase", "coinbase"),
  stock("HOODx", "Robinhood", "robinhood"),
  stock("SPYx", "S&P 500", undefined, "S&P"),
  stock("QQQx", "Nasdaq 100", undefined, "QQQ"),
  stock("MSFTx", "Microsoft", undefined, "M"),
  stock("AMZNx", "Amazon", undefined, "a"),
  stock("MSTRx", "Strategy", undefined, "MS"),
  stock("CRCLx", "Circle", undefined, "C"),
  stock("ORCLx", "Oracle", undefined, "O"),
  stock("JPMx", "JPMorgan", undefined, "JP"),
  stock("LLYx", "Eli Lilly", undefined, "L"),
  stock("GLDx", "Gold", undefined, "Au"),
  stock("ANTHx", "Anthropic", "anthropic"),

  // ------------------------------------------------------------- crypto
  { symbol: "SOL", name: "Solana", kind: "crypto", logo: "solana", mint: SOL_MINT },
  { symbol: "wBTC", name: "Bitcoin", kind: "crypto", logo: "bitcoin", mint: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh" },
  { symbol: "cbBTC", name: "Coinbase BTC", kind: "crypto", logo: "bitcoin", mint: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij" },
  { symbol: "ETH", name: "Ethereum", kind: "crypto", logo: "ethereum", mint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs" },
  { symbol: "JUP", name: "Jupiter", kind: "crypto", mark: "J", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
  { symbol: "JTO", name: "Jito", kind: "crypto", mark: "JT", mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL" },
  { symbol: "PYTH", name: "Pyth", kind: "crypto", mark: "P", mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3" },
  { symbol: "RAY", name: "Raydium", kind: "crypto", mark: "R", mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" },

  // ------------------------------------------------------------- memecoins
  { symbol: "BONK", name: "Bonk", kind: "meme", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { symbol: "WIF", name: "dogwifhat", kind: "meme", mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
  { symbol: "POPCAT", name: "Popcat", kind: "meme", mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr" },
  { symbol: "FARTCOIN", name: "Fartcoin", kind: "meme", mint: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump" },
  { symbol: "PENGU", name: "Pudgy Penguins", kind: "meme", mint: "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv" },
  { symbol: "TRUMP", name: "Official Trump", kind: "meme", mint: "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN" },
  { symbol: "PNUT", name: "Peanut the Squirrel", kind: "meme", mint: "2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump" },
  { symbol: "MEW", name: "cat in a dogs world", kind: "meme", mint: "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5" },
  { symbol: "GIGA", name: "GIGACHAD", kind: "meme", mint: "63LfDmNb3MQ8mw9MtZ2To9bEA2M71kZUUGq5tiJxcqj9" },
  { symbol: "MOODENG", name: "Moo Deng", kind: "meme", mint: "ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY" },
];

export interface CatalogBasket {
  id: string;
  code: string;
  name: string;
  description: string;
  rebalance: string;
  /** symbol → percent; sums to 100. */
  weights: Record<string, number>;
}

export const CURATED: CatalogBasket[] = [
  {
    id: "ai-supercycle",
    code: "AISC",
    name: "AI Supercycle",
    description: "The names building the compute buildout, chips to models.",
    rebalance: "Every 30 days or 5% drift",
    weights: { NVDAx: 24, AVGOx: 18, GOOGLx: 16, AMDx: 14, METAx: 14, PLTRx: 14 },
  },
  {
    id: "onchain-80-20",
    code: "8020",
    name: "Onchain 80/20",
    description: "US equities against bitcoin, eighty to twenty.",
    rebalance: "Every 7 days",
    weights: { SPYx: 80, wBTC: 20 },
  },
  {
    id: "vision",
    code: "VIS",
    name: "Vision",
    description: "Bitcoin, Solana and pre-IPO Anthropic — the frontier.",
    rebalance: "Every 30 days",
    weights: { wBTC: 34, SOL: 26, ANTHx: 22, NVDAx: 18 },
  },
  {
    id: "meme-index",
    code: "MEME",
    name: "Meme Index",
    description: "The Solana meta in one bag — rebalanced so no dog runs away.",
    rebalance: "Every 7 days or 10% drift",
    weights: { BONK: 30, WIF: 30, POPCAT: 20, FARTCOIN: 20 },
  },
  {
    id: "fintech-rails",
    code: "RAIL",
    name: "Fintech Rails",
    description: "The on-ramps and the chains they settle on.",
    rebalance: "Every 30 days",
    weights: { COINx: 30, HOODx: 25, SOL: 25, ETH: 20 },
  },
  {
    id: "big-tech",
    code: "MAG",
    name: "Big Tech",
    description: "Five megacaps, equal parts, one token.",
    rebalance: "Every 90 days",
    weights: { AAPLx: 20, GOOGLx: 20, METAx: 20, NFLXx: 20, TSLAx: 20 },
  },
];
