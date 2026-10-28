import { query } from "../db.js";
import { holdingsOf, nav24hAgo, navHistory, navOf, type HoldingRow } from "./nav.js";

/**
 * Database rows → the shapes the website already renders (`data/mocks/app.ts`):
 * the API answers in the app's own vocabulary so wiring it in is a swap of the
 * data source, not a rewrite of the screens.
 */

export const usd = (v: number | null | undefined): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
};

const round = (v: number, d = 2) => Number(v.toFixed(d));

export interface AssetView {
  symbol: string;
  name: string;
  kind: "stock" | "crypto" | "meme";
  logo?: string;
  mark?: string;
  icon?: string;
  mint: string;
  price: number;
  change: number;
  mcap: string;
  volume: string;
  holders: number;
  baskets: number;
}

export async function assetViews(): Promise<AssetView[]> {
  const { rows } = await query<{
    symbol: string; name: string; kind: AssetView["kind"]; logo: string | null; mark: string | null;
    icon_url: string | null; mint: string; usd_price: number; change_24h: number | null;
    mcap: number | null; volume_24h: number | null; holders: number | null; baskets: number;
  }>(
    `SELECT a.symbol, a.name, a.kind, a.logo, a.mark, a.icon_url, a.mint,
            a.usd_price::float8 AS usd_price, a.change_24h::float8 AS change_24h,
            a.mcap::float8 AS mcap, a.volume_24h::float8 AS volume_24h, a.holders,
            (SELECT count(*)::int FROM basket_holdings h WHERE h.symbol = a.symbol) AS baskets
       FROM assets a
      WHERE a.listed AND a.usd_price IS NOT NULL
      ORDER BY a.mcap DESC NULLS LAST`,
  );
  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    kind: r.kind,
    ...(r.logo ? { logo: r.logo } : {}),
    ...(r.mark ? { mark: r.mark } : {}),
    ...(r.icon_url ? { icon: r.icon_url } : {}),
    mint: r.mint,
    price: r.usd_price,
    change: round(r.change_24h ?? 0),
    mcap: usd(r.mcap),
    volume: usd(r.volume_24h),
    holders: r.holders ?? 0,
    baskets: r.baskets,
  }));
}

export interface BasketView {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  change: number;
  tvl: string;
  tvlUsd: number;
  holders: number;
  created: string;
  rebalance: string;
  holdings: { symbol: string; weight: number }[];
  history: number[];
  deployed: boolean;
  shareMint: string | null;
  curated: boolean;
}

interface BasketRow {
  id: string; code: string; name: string; description: string; rebalance: string; created_at: string;
  share_mint: string | null; shares_raw: string; share_decimals: number; curated: boolean; base_nav: number;
}

const created = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

async function shape(rows: BasketRow[], withHistory: boolean): Promise<BasketView[]> {
  if (rows.length === 0) return [];
  const all = await holdingsOf(rows.map((r) => r.id));
  const holders = await query<{ basket_id: string; n: number }>(
    `SELECT basket_id, count(*)::int AS n FROM holdings_by_user WHERE shares_raw > 0 GROUP BY basket_id`,
  );
  const holderCount = Object.fromEntries(holders.rows.map((h) => [h.basket_id, h.n]));

  const out: BasketView[] = [];
  for (const r of rows) {
    const h: HoldingRow[] = all.filter((x) => x.basket_id === r.id);
    const nav = navOf(h);
    const before = nav24hAgo(h);
    const shares = Number(BigInt(r.shares_raw)) / 10 ** r.share_decimals;
    const hist = withHistory ? (await navHistory(r.id, 90)).map((p) => round(p.nav, 4)) : [];
    if (withHistory && nav > 0) hist.push(round(nav, 4));
    out.push({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      price: round(nav > 0 ? nav : r.base_nav, 4),
      change: before > 0 ? round(((nav - before) / before) * 100) : 0,
      tvl: usd(shares * nav),
      tvlUsd: round(shares * nav),
      holders: holderCount[r.id] ?? 0,
      created: created(r.created_at),
      rebalance: r.rebalance,
      holdings: h.map((x) => ({ symbol: x.symbol, weight: round(x.weight_bps / 100, 1) })),
      history: hist,
      deployed: Boolean(r.share_mint),
      shareMint: r.share_mint,
      curated: r.curated,
    });
  }
  return out;
}

const BASKET_COLS = `id, code, name, description, rebalance, created_at::text AS created_at, share_mint,
  shares_raw::text AS shares_raw, share_decimals, curated, base_nav::float8 AS base_nav`;

export async function basketViews(withHistory = true): Promise<BasketView[]> {
  const { rows } = await query<BasketRow>(
    `SELECT ${BASKET_COLS} FROM baskets WHERE access = 'public' ORDER BY curated DESC, created_at`,
  );
  return shape(rows, withHistory);
}

export async function basketView(idOrCode: string): Promise<BasketView | null> {
  const { rows } = await query<BasketRow>(
    `SELECT ${BASKET_COLS} FROM baskets WHERE id = $1 OR upper(code) = upper($1) LIMIT 1`,
    [idOrCode],
  );
  return (await shape(rows, true))[0] ?? null;
}
