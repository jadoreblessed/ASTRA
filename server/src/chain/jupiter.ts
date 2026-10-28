import { config } from "../config.js";
import { log } from "../logger.js";

/**
 * Jupiter: token metadata, live prices, quotes and swap transactions. Free
 * `lite-api` endpoints, no key. Every call has a timeout and returns typed,
 * already-checked data or throws.
 */

const TIMEOUT_MS = 12_000;
/**
 * The free tier rate-limits bursts. Two lanes, each one call at a time: market
 * data (tokens, prices) ~1/s, quotes and swaps ~4/s so the trade panel stays
 * quick while the worker syncs. Both back off and retry on 429.
 */
const lanes = { data: { gap: 1_100, last: 0, queue: Promise.resolve() as Promise<unknown> }, trade: { gap: 250, last: 0, queue: Promise.resolve() as Promise<unknown> } };

function paced<T>(lane: keyof typeof lanes, fn: () => Promise<T>): Promise<T> {
  const l = lanes[lane];
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      const wait = l.last + l.gap - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      l.last = Date.now();
      try {
        return await fn();
      } catch (err) {
        if (attempt < 3 && String(err).includes("429")) {
          await new Promise((r) => setTimeout(r, 1_500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
  };
  const next = l.queue.then(run, run);
  l.queue = next.catch(() => undefined);
  return next;
}

async function get<T>(path: string): Promise<T> {
  return paced(path.startsWith("/swap") ? "trade" : "data", async () => {
    const res = await fetch(`${config.JUPITER_API}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`jupiter ${path.split("?")[0]} → ${res.status}`);
    return (await res.json()) as T;
  });
}

export interface JupToken {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  holderCount?: number;
  mcap?: number;
  usdPrice?: number;
  liquidity?: number;
  isVerified?: boolean;
  tags?: string[];
  stats24h?: { priceChange?: number; buyVolume?: number; sellVolume?: number };
}

/** Free-text or comma-separated mints (≤100). */
export const searchTokens = (q: string) => get<JupToken[]>(`/tokens/v2/search?query=${encodeURIComponent(q)}`);

/** The verified, most liquid token whose symbol is exactly `symbol`. */
export async function resolveSymbol(symbol: string): Promise<JupToken | null> {
  const hits = await searchTokens(symbol);
  const exact = hits
    .filter((t) => t.symbol === symbol && (t.isVerified || t.tags?.includes("verified")))
    .sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0));
  return exact[0] ?? null;
}

export interface JupPrice {
  usdPrice: number;
  priceChange24h?: number;
  decimals: number;
}

/** Live USD prices for up to 50 mints per call. */
export async function prices(mints: string[]): Promise<Record<string, JupPrice>> {
  const out: Record<string, JupPrice> = {};
  for (let i = 0; i < mints.length; i += 50) {
    const batch = mints.slice(i, i + 50);
    try {
      Object.assign(out, await get<Record<string, JupPrice>>(`/price/v3?ids=${batch.join(",")}`));
    } catch (err) {
      log.warn({ err: String(err) }, "price batch failed");
    }
  }
  return out;
}

export interface JupQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: { swapInfo: { label?: string } }[];
}

export async function quote(inputMint: string, outputMint: string, amountRaw: bigint, slippageBps: number): Promise<JupQuote> {
  return get<JupQuote>(
    `/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`,
  );
}

/** A serialized, unsigned swap transaction for `owner` (base64). */
export async function swapTransaction(q: JupQuote, owner: string): Promise<string> {
  const res = await fetch(`${config.JUPITER_API}/swap/v1/swap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      quoteResponse: q,
      userPublicKey: owner,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      // a small, bounded tip so swaps land without overpaying.
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 20_000, priorityLevel: "medium" } },
    }),
  });
  if (!res.ok) throw new Error(`jupiter swap → ${res.status}`);
  const body = (await res.json()) as { swapTransaction?: string };
  if (!body.swapTransaction) throw new Error("jupiter swap: no transaction");
  return body.swapTransaction;
}
