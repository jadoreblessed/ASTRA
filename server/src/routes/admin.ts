import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { vaultAddress } from "../chain/wallet.js";
import { chain } from "../chain/port.js";
import { config, isProd } from "../config.js";
import { one, query } from "../db.js";
import { log } from "../logger.js";
import { isPaused, spentLamports } from "../policy/limits.js";
import { vaultFreeLamports } from "../services/costs.js";
import { saveSiteLinks, siteLinks, type SiteLinks } from "../services/site-links.js";
import { signer } from "../signer/client.js";
import { safeEqual } from "../util/crypto.js";

/**
 * /admin's backend. Public: GET /api/site. Everything else sits behind
 * ADMIN_TOKEN (sent as `x-admin-token`): the links, the pause switch, the state
 * of the vault and the commission, withdrawing it to the fixed treasury wallet,
 * and spending it on the $ASTRA buyback. In development an unset token falls back
 * to "astra-admin"; in production an unset token turns admin off.
 */

const adminToken = (): string | null => config.ADMIN_TOKEN || (isProd ? null : "astra-admin");

/** A link the way people paste it: "x.com/handle" becomes "https://x.com/handle". */
const asUrl = (s: string) => (s && !/^https?:\/\//i.test(s) ? `https://${s}` : s);

const linksBody = z.object({
  ca: z.string().trim().max(100).default(""),
  x: z.string().trim().max(300).default(""),
  telegram: z.string().trim().max(300).default(""),
});
const pauseBody = z.object({ paused: z.boolean() });
const currencyBody = z.object({ currency: z.enum(["USDC", "SOL"]) });

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  if (!config.ADMIN_TOKEN && !isProd) log.warn('ADMIN_TOKEN is empty — /admin uses the dev key "astra-admin". Set one before deploying.');

  const allowed = (req: FastifyRequest, reply: FastifyReply): boolean => {
    const token = adminToken();
    if (!token) {
      void reply.code(403).send({ error: "Admin is off. Set ADMIN_TOKEN on the server." });
      return false;
    }
    if (!safeEqual(String(req.headers["x-admin-token"] ?? ""), token)) {
      void reply.code(401).send({ error: "Wrong admin key." });
      return false;
    }
    return true;
  };

  app.get("/api/site", async () => ({ links: await siteLinks() }));

  const strict = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

  app.post("/api/admin/check", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!allowed(req, reply)) return;
    return { ok: true };
  });

  app.post("/api/admin/site", strict, async (req, reply) => {
    if (!allowed(req, reply)) return;
    const p = linksBody.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "Those links are too long." });
    const links: SiteLinks = { ca: p.data.ca, x: asUrl(p.data.x), telegram: asUrl(p.data.telegram) };
    await saveSiteLinks(links);
    log.info({ ...links }, "site links updated");
    return { links };
  });

  /** Everything the operator needs at launch, on one screen. */
  app.post("/api/admin/status", strict, async (req, reply) => {
    if (!allowed(req, reply)) return;
    const vault = await vaultAddress();
    const lamports = await chain.balanceOf(vault).catch(() => null);
    const free = await vaultFreeLamports().catch(() => null);
    const fees = await query<{ currency: string; raw: string }>(`SELECT currency, sum(raw)::text AS raw FROM fee_ledger WHERE taken_sig IS NULL GROUP BY currency`);
    const burned = await query<{ mint: string; raw: string; decimals: number }>(`SELECT mint, sum(raw)::text AS raw, max(decimals) AS decimals FROM burns GROUP BY mint`);
    const { rows: payouts } = await query<Record<string, unknown>>(
      `SELECT id::text AS id, order_id, mint, raw::text AS raw, decimals, reason, status, attempts, error
         FROM payouts WHERE status <> 'sent' ORDER BY id LIMIT 20`,
    );
    const { rows: orders } = await query<Record<string, unknown>>(
      `SELECT o.id, b.code, o.side, o.currency, o.amount::float8 AS amount, o.status, o.error, o.deposit_sig, o.created_at, u.wallet
         FROM orders o JOIN baskets b ON b.id = o.basket_id JOIN users u ON u.id = o.user_id
        WHERE o.status <> 'awaiting_deposit' ORDER BY o.created_at DESC LIMIT 12`,
    );
    const stuck = await one<{ n: number }>(`SELECT count(*)::int AS n FROM orders WHERE status = 'failed' OR (status = 'executing' AND updated_at < now() - interval '10 minutes')`);
    const ui = (raw: string, decimals: number) => Number(BigInt(raw)) / 10 ** decimals;
    return {
      trading: config.TRADING_ENABLED,
      paused: await isPaused(),
      vault,
      vaultSol: lamports === null ? null : lamports / 1e9,
      freeSol: free === null ? null : Math.max(0, free) / 1e9,
      spentSol: Math.max(0, await spentLamports()) / 1e9,
      capSol: config.MAX_TOTAL_SPEND_LAMPORTS / 1e9,
      feeBps: config.PLATFORM_FEE_BPS,
      maxOrderUsd: config.MAX_ORDER_USD,
      treasury: config.TREASURY_WALLET,
      fees: {
        USDC: ui(fees.rows.find((f) => f.currency === "USDC")?.raw ?? "0", 6),
        SOL: ui(fees.rows.find((f) => f.currency === "SOL")?.raw ?? "0", 9),
      },
      burned: burned.rows.map((b) => ({ mint: b.mint, amount: ui(b.raw, b.decimals) })),
      stuckOrders: stuck?.n ?? 0,
      payouts,
      orders,
    };
  });

  app.post("/api/admin/pause", strict, async (req, reply) => {
    if (!allowed(req, reply)) return;
    const p = pauseBody.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "Bad request." });
    await query(`INSERT INTO kv (key, value) VALUES ('paused', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [p.data.paused ? "1" : "0"]);
    log.warn({ paused: p.data.paused }, "trading pause switched");
    return { paused: p.data.paused };
  });

  /** Sends everything still owed, including payouts that had given up. */
  app.post("/api/admin/retry-payouts", strict, async (req, reply) => {
    if (!allowed(req, reply)) return;
    const r = await signer<{ sent: number; left: number }>("/payouts", { retryFailed: true });
    if (!r.ok) return reply.code(502).send({ error: r.error });
    return r.result;
  });

  for (const action of ["withdraw", "buyback"] as const) {
    app.post(`/api/admin/${action}`, strict, async (req, reply) => {
      if (!allowed(req, reply)) return;
      const p = currencyBody.safeParse(req.body ?? {});
      if (!p.success) return reply.code(400).send({ error: "Pick USDC or SOL." });
      const r = await signer(`/${action}`, { currency: p.data.currency });
      if (!r.ok) return reply.code(502).send({ error: r.error });
      return { result: r.result };
    });
  }
}
