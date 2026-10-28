import { config } from "../config.js";
import { one } from "../db.js";
import type { Limits } from "./engine.js";

export const limits = (): Limits => ({
  tradingEnabled: config.TRADING_ENABLED,
  maxTotalSpendLamports: config.MAX_TOTAL_SPEND_LAMPORTS,
  maxOrderUsd: config.MAX_ORDER_USD,
  maxSlippageBps: config.MAX_SLIPPAGE_BPS,
  priceMaxAgeSec: config.PRICE_MAX_AGE_SEC,
  maxBasketAssets: config.MAX_BASKET_ASSETS,
});

export async function spentLamports(): Promise<number> {
  const row = await one<{ s: string | null }>(`SELECT sum(lamports)::text AS s FROM spend_ledger`);
  return Number(row?.s ?? 0);
}
