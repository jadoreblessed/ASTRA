/**
 * The limits, as pure functions — no I/O, so they are tested on their own
 * (`tests/policy.test.ts`) and run twice: once in the API before an order is
 * accepted, and again in the signer before anything is signed.
 */

export interface Limits {
  tradingEnabled: boolean;
  maxTotalSpendLamports: number;
  maxOrderUsd: number;
  maxSlippageBps: number;
  priceMaxAgeSec: number;
  maxBasketAssets: number;
}

export type Verdict = { ok: true } | { ok: false; code: string; reason: string };

const OK: Verdict = { ok: true };
const no = (code: string, reason: string): Verdict => ({ ok: false, code, reason });

export const checkTrading = (l: Limits): Verdict =>
  l.tradingEnabled ? OK : no("trading_off", "Trading opens at the $ASTRA launch.");

/** Spent so far plus this send must stay inside the lifetime budget. */
export const checkBudget = (l: Limits, spentLamports: number, estimateLamports: number): Verdict =>
  spentLamports + estimateLamports <= l.maxTotalSpendLamports
    ? OK
    : no(
        "budget",
        `Platform spend cap reached: ${(spentLamports / 1e9).toFixed(4)} of ${(l.maxTotalSpendLamports / 1e9).toFixed(4)} SOL used.`,
      );

export const checkOrderSize = (l: Limits, usd: number): Verdict => {
  if (!Number.isFinite(usd) || usd <= 0) return no("amount", "Enter an amount above zero.");
  return usd <= l.maxOrderUsd ? OK : no("amount", `Orders are capped at $${l.maxOrderUsd} for now.`);
};

export const checkSlippage = (l: Limits, bps: number): Verdict =>
  bps > 0 && bps <= l.maxSlippageBps ? OK : no("slippage", `Price limit must be between 0 and ${l.maxSlippageBps} bps.`);

/** "Price freshness < 2 min or no trade." */
export const checkFresh = (l: Limits, priceAt: Date | null, now = new Date()): Verdict => {
  if (!priceAt) return no("stale", "No live price yet.");
  const age = (now.getTime() - priceAt.getTime()) / 1000;
  return age <= l.priceMaxAgeSec ? OK : no("stale", `Price is ${Math.round(age)}s old — trades need under ${l.priceMaxAgeSec}s.`);
};

/** A basket: 1..max distinct assets, positive weights summing to exactly 100%. */
export const checkBasketShape = (l: Limits, weights: { symbol: string; weight_bps: number }[]): Verdict => {
  if (weights.length === 0) return no("shape", "Pick at least one asset.");
  if (weights.length > l.maxBasketAssets) return no("shape", `Up to ${l.maxBasketAssets} assets in a basket.`);
  if (new Set(weights.map((w) => w.symbol)).size !== weights.length) return no("shape", "Each asset can appear once.");
  if (weights.some((w) => !Number.isInteger(w.weight_bps) || w.weight_bps <= 0)) return no("shape", "Every weight must be above zero.");
  const total = weights.reduce((s, w) => s + w.weight_bps, 0);
  return total === 10_000 ? OK : no("shape", `Weights must add up to 100% (now ${(total / 100).toFixed(1)}%).`);
};

/** Splits `amount` across weights in base units; the rounding dust goes to the largest leg. */
export function splitByWeight(amount: bigint, weights: number[]): bigint[] {
  const total = BigInt(weights.reduce((s, w) => s + w, 0));
  if (total === 0n) return weights.map(() => 0n);
  const legs = weights.map((w) => (amount * BigInt(w)) / total);
  const dust = amount - legs.reduce((s, x) => s + x, 0n);
  const big = weights.indexOf(Math.max(...weights));
  legs[big] += dust;
  return legs;
}
