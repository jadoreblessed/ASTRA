import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { one } from "../db.js";
import { vaultAddress } from "../chain/wallet.js";
import { signerUp } from "../signer/client.js";
import { spentLamports } from "../policy/limits.js";
import { assetViews, basketView, basketViews, usd } from "../services/views.js";
import { navHistory } from "../services/nav.js";

/** Read-only market data — everything the Explore / Assets / basket screens show. */
export async function siteRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    signer: await signerUp(),
    trading: config.TRADING_ENABLED,
    cluster: config.SOLANA_CLUSTER,
  }));

  app.get("/api/config", async () => ({
    cluster: config.SOLANA_CLUSTER,
    trading: config.TRADING_ENABLED,
    vault: await vaultAddress(),
    maxOrderUsd: config.MAX_ORDER_USD,
    maxSlippageBps: config.MAX_SLIPPAGE_BPS,
    maxBasketAssets: config.MAX_BASKET_ASSETS,
    spendCapSol: config.MAX_TOTAL_SPEND_LAMPORTS / 1e9,
    spentSol: (await spentLamports()) / 1e9,
  }));

  app.get("/api/stats", async () => {
    const baskets = await basketViews(false);
    const holders = await one<{ n: number }>(`SELECT count(DISTINCT user_id)::int AS n FROM holdings_by_user WHERE shares_raw > 0`);
    const listed = await one<{ n: number }>(`SELECT count(*)::int AS n FROM assets WHERE listed AND usd_price IS NOT NULL`);
    const tvl = baskets.reduce((s, b) => s + b.tvlUsd, 0);
    return { tvl: usd(tvl), tvlUsd: tvl, baskets: baskets.length, holders: holders?.n ?? 0, listed: listed?.n ?? 0 };
  });

  app.get("/api/assets", async () => ({ assets: await assetViews() }));

  app.get("/api/baskets", async () => ({ baskets: await basketViews(true) }));

  app.get<{ Params: { id: string } }>("/api/baskets/:id", async (req, reply) => {
    const b = await basketView(req.params.id);
    if (!b) return reply.code(404).send({ error: "No such basket." });
    return { basket: b };
  });

  app.get<{ Params: { id: string }; Querystring: { days?: string } }>("/api/baskets/:id/history", async (req, reply) => {
    const b = await one<{ id: string }>(`SELECT id FROM baskets WHERE id = $1 OR upper(code) = upper($1)`, [req.params.id]);
    if (!b) return reply.code(404).send({ error: "No such basket." });
    const days = Math.min(365, Math.max(1, Number(req.query.days ?? 90)));
    return { history: await navHistory(b.id, days) };
  });
}
