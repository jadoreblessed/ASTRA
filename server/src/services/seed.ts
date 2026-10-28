import { CATALOG, CURATED } from "../catalog.js";
import { query } from "../db.js";
import { log } from "../logger.js";
import { unitsFor } from "./nav.js";

/**
 * First-boot data: the catalog's assets and the curated baskets. Idempotent —
 * it only inserts what is missing, so it runs on every start.
 */
export async function seed(): Promise<void> {
  for (const a of CATALOG) {
    await query(
      `INSERT INTO assets (symbol, name, kind, logo, mark, mint)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind,
         logo = EXCLUDED.logo, mark = EXCLUDED.mark,
         mint = COALESCE(assets.mint, EXCLUDED.mint)`,
      [a.symbol, a.name, a.kind, a.logo ?? null, a.mark ?? null, a.mint ?? null],
    );
  }

  for (const b of CURATED) {
    await query(
      `INSERT INTO baskets (id, code, name, description, rebalance, curated, created_at)
       VALUES ($1, $2, $3, $4, $5, true, now() - interval '90 days')
       ON CONFLICT (id) DO NOTHING`,
      [b.id, b.code, b.name, b.description, b.rebalance],
    );
    for (const [symbol, pct] of Object.entries(b.weights)) {
      await query(
        `INSERT INTO basket_holdings (basket_id, symbol, weight_bps, units)
         VALUES ($1, $2, $3, 0) ON CONFLICT DO NOTHING`,
        [b.id, symbol, Math.round(pct * 100)],
      );
    }
  }
}

/**
 * Fixes each basket's units once its assets are priced. Curated baskets are
 * anchored at the oldest day (within 90) on which every holding has a close, so
 * their chart starts at `base_nav`; a basket with no history yet anchors on live
 * prices. Baskets that already have units are left alone.
 */
export async function settleUnits(): Promise<void> {
  // Only baskets never fixed (every unit still 0) whose listed assets are all
  // priced: fixing in pieces, as prices trickle in, would skew the weights.
  const { rows: pending } = await query<{ id: string; base_nav: number; curated: boolean }>(
    `SELECT b.id, b.base_nav::float8 AS base_nav, b.curated
       FROM baskets b
      WHERE NOT EXISTS (SELECT 1 FROM basket_holdings h WHERE h.basket_id = b.id AND h.units > 0)
        AND NOT EXISTS (SELECT 1 FROM basket_holdings h JOIN assets a ON a.symbol = h.symbol
                         WHERE h.basket_id = b.id AND (a.synced_at IS NULL OR (a.listed AND a.usd_price IS NULL)))`,
  );
  for (const b of pending) {
    const { rows: weights } = await query<{ symbol: string; weight_bps: number; usd_price: number | null }>(
      `SELECT h.symbol, h.weight_bps, a.usd_price::float8 AS usd_price
         FROM basket_holdings h JOIN assets a ON a.symbol = h.symbol WHERE h.basket_id = $1`,
      [b.id],
    );
    const live = weights.filter((w) => w.usd_price !== null && w.usd_price > 0);
    if (live.length === 0) continue;

    let priceAt: Record<string, number | undefined> = Object.fromEntries(live.map((w) => [w.symbol, w.usd_price ?? undefined]));
    if (b.curated) {
      // Wait until every holding's history is in (or known to be unavailable),
      // so the anchor really is ~90 days back and not just today.
      const waiting = await query<{ symbol: string }>(
        `SELECT a.symbol FROM assets a
          WHERE a.symbol = ANY($1)
            AND (SELECT count(*) FROM asset_daily d WHERE d.symbol = a.symbol) < 20
            AND NOT EXISTS (SELECT 1 FROM kv WHERE kv.key = 'backfill_failed:' || a.symbol)`,
        [live.map((w) => w.symbol)],
      );
      if (waiting.rows.length > 0) continue;
      const anchor = await query<{ day: string }>(
        `SELECT d.day::text AS day FROM asset_daily d
          WHERE d.symbol = ANY($1) AND d.day >= current_date - 90
          GROUP BY d.day HAVING count(*) = $2 ORDER BY d.day LIMIT 1`,
        [live.map((w) => w.symbol), live.length],
      );
      if (anchor.rows[0]) {
        const closes = await query<{ symbol: string; close: number }>(
          `SELECT symbol, close::float8 AS close FROM asset_daily WHERE day = $1::date AND symbol = ANY($2)`,
          [anchor.rows[0].day, live.map((w) => w.symbol)],
        );
        priceAt = Object.fromEntries(closes.rows.map((c) => [c.symbol, c.close]));
      } else {
        // No history yet — wait for the backfill rather than anchor on today.
        continue;
      }
    }

    const units = unitsFor(live, priceAt, b.base_nav);
    for (const [symbol, u] of Object.entries(units)) {
      await query(`UPDATE basket_holdings SET units = $3 WHERE basket_id = $1 AND symbol = $2 AND units = 0`, [b.id, symbol, u]);
    }
    log.info({ basket: b.id }, "basket units fixed");
  }
}
