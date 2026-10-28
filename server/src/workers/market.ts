import { query } from "../db.js";
import { log } from "../logger.js";
import { dailyCloses } from "../chain/gecko.js";
import { prices, resolveSymbol, searchTokens, type JupToken } from "../chain/jupiter.js";

/**
 * Market data: which tokens are real and listed, what they cost now, and what
 * they closed at each day. All reads, all free endpoints, nothing signed.
 */

const meta = (t: JupToken) => ({
  decimals: t.decimals,
  icon: t.icon ?? null,
  mcap: t.mcap ?? null,
  holders: t.holderCount ?? null,
  volume: (t.stats24h?.buyVolume ?? 0) + (t.stats24h?.sellVolume ?? 0) || null,
});

/**
 * Resolves and verifies every asset's mint. A pinned mint is accepted only if
 * Jupiter knows it; an unpinned one is looked up by exact symbol among verified
 * tokens. Unresolved assets stay unlisted.
 */
export async function syncTokens(): Promise<void> {
  const { rows } = await query<{ symbol: string; mint: string | null }>(`SELECT symbol, mint FROM assets`);

  const pinned = rows.filter((r) => r.mint);
  for (let i = 0; i < pinned.length; i += 80) {
    const batch = pinned.slice(i, i + 80);
    let found: JupToken[] = [];
    try {
      found = await searchTokens(batch.map((r) => r.mint).join(","));
    } catch (err) {
      log.warn({ err: String(err) }, "token batch lookup failed");
      continue;
    }
    for (const r of batch) {
      // The mint is the identity; Jupiter's symbol casing (WBTC vs wBTC) is cosmetic.
      const t = found.find((x) => x.id === r.mint);
      if (!t) {
        await query(`UPDATE assets SET listed = false, synced_at = now() WHERE symbol = $1`, [r.symbol]);
        continue;
      }
      const m = meta(t);
      await query(
        `UPDATE assets SET listed = true, decimals = $2, icon_url = $3, mcap = $4, holders = $5, volume_24h = $6, synced_at = now()
          WHERE symbol = $1`,
        [r.symbol, m.decimals, m.icon, m.mcap, m.holders, m.volume],
      );
    }
  }

  for (const r of rows.filter((x) => !x.mint)) {
    try {
      const t = await resolveSymbol(r.symbol);
      if (!t) {
        await query(`UPDATE assets SET listed = false, synced_at = now() WHERE symbol = $1`, [r.symbol]);
        continue;
      }
      const m = meta(t);
      await query(
        `UPDATE assets SET mint = $2, listed = true, decimals = $3, icon_url = $4, mcap = $5, holders = $6, volume_24h = $7, synced_at = now()
          WHERE symbol = $1 AND NOT EXISTS (SELECT 1 FROM assets o WHERE o.mint = $2 AND o.symbol <> $1)`,
        [r.symbol, t.id, m.decimals, m.icon, m.mcap, m.holders, m.volume],
      );
    } catch (err) {
      log.warn({ symbol: r.symbol, err: String(err) }, "symbol lookup failed");
    }
  }
  const listed = await query<{ n: number }>(`SELECT count(*)::int AS n FROM assets WHERE listed`);
  log.info({ listed: listed.rows[0]?.n }, "tokens synced");
}

/** Live prices for every listed asset, and today's close kept current. */
export async function refreshPrices(): Promise<void> {
  const { rows } = await query<{ symbol: string; mint: string }>(`SELECT symbol, mint FROM assets WHERE listed AND mint IS NOT NULL`);
  if (rows.length === 0) return;
  const live = await prices(rows.map((r) => r.mint));
  let n = 0;
  for (const r of rows) {
    const p = live[r.mint];
    if (!p || !Number.isFinite(p.usdPrice) || p.usdPrice <= 0) continue;
    n++;
    await query(`UPDATE assets SET usd_price = $2, change_24h = $3, price_at = now() WHERE symbol = $1`, [
      r.symbol,
      p.usdPrice,
      p.priceChange24h ?? null,
    ]);
    await query(
      `INSERT INTO asset_daily (symbol, day, close) VALUES ($1, current_date, $2)
       ON CONFLICT (symbol, day) DO UPDATE SET close = EXCLUDED.close`,
      [r.symbol, p.usdPrice],
    );
  }
  log.debug({ priced: n }, "prices refreshed");
}

/**
 * Backfills ~120 daily closes for assets that have little history, basket
 * holdings first. Paced for GeckoTerminal's free tier, so a cold start fills
 * the curated baskets' charts in a minute or two and the rest after.
 */
export async function backfillHistory(limit = 12): Promise<number> {
  const { rows } = await query<{ symbol: string; mint: string }>(
    `SELECT a.symbol, a.mint FROM assets a
      WHERE a.listed AND a.mint IS NOT NULL
        AND (SELECT count(*) FROM asset_daily d WHERE d.symbol = a.symbol) < 20
        AND COALESCE((SELECT value FROM kv WHERE key = 'backfill_failed:' || a.symbol)::timestamptz, 'epoch') < now() - interval '6 hours'
      ORDER BY EXISTS (SELECT 1 FROM basket_holdings h WHERE h.symbol = a.symbol) DESC, a.mcap DESC NULLS LAST
      LIMIT $1`,
    [limit],
  );
  let done = 0;
  for (const r of rows) {
    try {
      const closes = await dailyCloses(r.mint, 120);
      if (closes.length === 0) throw new Error("no pool");
      for (const [ts, close] of closes) {
        await query(
          `INSERT INTO asset_daily (symbol, day, close) VALUES ($1, to_timestamp($2)::date, $3)
           ON CONFLICT (symbol, day) DO NOTHING`,
          [r.symbol, ts, close],
        );
      }
      done++;
      log.info({ symbol: r.symbol, days: closes.length }, "history backfilled");
    } catch (err) {
      // Only a token with no pool is parked for hours; a rate limit just retries next round.
      if (!String(err).includes("429")) {
        await query(
          `INSERT INTO kv (key, value) VALUES ($1, now()::text) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [`backfill_failed:${r.symbol}`],
        );
      }
      log.warn({ symbol: r.symbol, err: String(err) }, "history backfill failed");
    }
  }
  return done;
}
