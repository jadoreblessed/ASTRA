import { config } from "../config.js";
import { one } from "../db.js";
import { checkTrading, type Limits, type Verdict } from "./engine.js";

export const limits = (): Limits => ({
  tradingEnabled: config.TRADING_ENABLED,
  maxTotalSpendLamports: config.MAX_TOTAL_SPEND_LAMPORTS,
  maxOrderUsd: config.MAX_ORDER_USD,
  maxSlippageBps: config.MAX_SLIPPAGE_BPS,
  priceMaxAgeSec: config.PRICE_MAX_AGE_SEC,
  maxBasketAssets: config.MAX_BASKET_ASSETS,
});

/** The pause switch in /admin: stops new orders at once, without a restart. */
export async function isPaused(): Promise<boolean> {
  const row = await one<{ value: string }>(`SELECT value FROM kv WHERE key = 'paused'`);
  return row?.value === "1";
}

/** May new money move? The env switch, then the pause switch. */
export async function tradingGate(): Promise<Verdict> {
  const t = checkTrading(limits());
  if (!t.ok) return t;
  return (await isPaused()) ? { ok: false, code: "paused", reason: "Trading is paused for a moment." } : t;
}

/** What the platform has paid from its own pocket: spent, net of what buyers prepaid. */
export async function spentLamports(): Promise<number> {
  const row = await one<{ s: string | null }>(`SELECT sum(lamports)::text AS s FROM spend_ledger`);
  return Number(row?.s ?? 0);
}
