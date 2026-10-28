import { query } from "../db.js";

/**
 * Basket pricing — pure arithmetic over the asset table.
 *
 * A share is a fixed bundle: `units[i]` of each asset, set once at inception so
 * the share starts at `base_nav`. Its price is then just `sum(units * price)` —
 * the same number the vault would hand back on redemption, per share. History
 * is the same sum over daily closes, so the chart is the basket's real path.
 *
 * Holdings whose asset is not priced (not listed yet) are left out and the rest
 * renormalised, so one missing token never zeroes a basket.
 */

export interface HoldingRow {
  basket_id: string;
  symbol: string;
  weight_bps: number;
  units: number;
  usd_price: number | null;
  change_24h: number | null;
}

export const priced = (h: HoldingRow[]) => h.filter((x) => x.usd_price !== null && x.usd_price > 0 && x.units > 0);

export function navOf(h: HoldingRow[]): number {
  return priced(h).reduce((s, x) => s + x.units * (x.usd_price as number), 0);
}

/** The share price 24h ago, from each asset's own 24h change. */
export function nav24hAgo(h: HoldingRow[]): number {
  return priced(h).reduce((s, x) => s + (x.units * (x.usd_price as number)) / (1 + (x.change_24h ?? 0) / 100), 0);
}

/**
 * Units per share from weights and the prices at inception:
 * `units[i] = base * w[i] / price[i]`, weights renormalised over priced assets.
 */
export function unitsFor(
  weights: { symbol: string; weight_bps: number }[],
  priceAt: Record<string, number | undefined>,
  base: number,
): Record<string, number> {
  const ok = weights.filter((w) => (priceAt[w.symbol] ?? 0) > 0);
  const total = ok.reduce((s, w) => s + w.weight_bps, 0);
  const out: Record<string, number> = {};
  for (const w of ok) out[w.symbol] = (base * (w.weight_bps / total)) / (priceAt[w.symbol] as number);
  return out;
}

export async function holdingsOf(basketIds?: string[]): Promise<HoldingRow[]> {
  const { rows } = await query<HoldingRow>(
    `SELECT h.basket_id, h.symbol, h.weight_bps, h.units::float8 AS units,
            a.usd_price::float8 AS usd_price, a.change_24h::float8 AS change_24h
       FROM basket_holdings h JOIN assets a ON a.symbol = h.symbol
      ${basketIds ? "WHERE h.basket_id = ANY($1)" : ""}
      ORDER BY h.basket_id, h.weight_bps DESC`,
    basketIds ? [basketIds] : [],
  );
  return rows;
}

/** Daily share closes for the last `days` days, oldest first, from asset closes. */
export async function navHistory(basketId: string, days: number): Promise<{ day: string; nav: number }[]> {
  const { rows } = await query<{ day: string; nav: number; n: number; need: number }>(
    `WITH h AS (
        SELECT h.symbol, h.units::float8 AS units FROM basket_holdings h
          JOIN assets a ON a.symbol = h.symbol
         WHERE h.basket_id = $1 AND h.units > 0 AND a.usd_price IS NOT NULL
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            sum(h.units * d.close::float8) AS nav,
            count(*)::int AS n,
            (SELECT count(*)::int FROM h) AS need
       FROM asset_daily d JOIN h ON h.symbol = d.symbol
      WHERE d.day >= current_date - $2::int
      GROUP BY d.day
      ORDER BY d.day`,
    [basketId, days],
  );
  // A day only counts when every priced holding has a close for it.
  return rows.filter((r) => r.n === r.need).map((r) => ({ day: r.day, nav: Number(r.nav) }));
}
