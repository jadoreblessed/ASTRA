import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { one, query } from "../db.js";
import { SOL_MINT, USDC_MINT } from "../catalog.js";
import { quote as jupQuote } from "../chain/jupiter.js";
import { PublicKey } from "@solana/web3.js";
import { COMMITMENT, isAddress, parsedTx, received, rpc, signedBy } from "../chain/rpc.js";
import { programOf } from "../chain/spl.js";
import { vaultAddress } from "../chain/wallet.js";
import { requireUser } from "../http/auth.js";
import { checkBasketShape, checkFresh, checkOrderSize, checkTrading, splitByWeight } from "../policy/engine.js";
import { limits } from "../policy/limits.js";
import { signer } from "../signer/client.js";
import { basketView } from "../services/views.js";
import { unitsFor } from "../services/nav.js";
import { randomId } from "../util/crypto.js";

/**
 * Quotes, orders, deposits, and building your own basket.
 *
 * Quotes are always live and real — each leg is priced by Jupiter with the
 * platform's price limit — whether or not trading is on. Orders are refused
 * with `trading_off` until TRADING_ENABLED, so the whole flow can be shown and
 * tested end to end without a lamport moving.
 *
 * A non-custodial user pays with one plain transfer from their own wallet to the
 * vault — a transaction they can read in Phantom — then hands us its signature;
 * we read the chain to confirm it before the order counts as paid.
 */

const tradeBody = z.object({
  basket: z.string().min(1),
  side: z.enum(["buy", "sell", "redeem"]),
  amount: z.coerce.number().positive(),
  currency: z.enum(["USDC", "SOL"]).default("USDC"),
});

interface Leg {
  symbol: string;
  mint: string;
  decimals: number;
  weight_bps: number;
  units: number;
  usd_price: number;
  price_at: string | null;
}

const legsOf = async (basketId: string) =>
  (
    await query<Leg>(
      `SELECT h.symbol, a.mint, a.decimals, h.weight_bps, h.units::float8 AS units,
              a.usd_price::float8 AS usd_price, a.price_at::text AS price_at
         FROM basket_holdings h JOIN assets a ON a.symbol = h.symbol
        WHERE h.basket_id = $1 AND a.listed AND a.mint IS NOT NULL AND a.usd_price IS NOT NULL AND h.units > 0
        ORDER BY h.weight_bps DESC`,
      [basketId],
    )
  ).rows;

const toRaw = (ui: number, decimals: number) => BigInt(Math.floor(ui * 10 ** decimals));
const fromRaw = (raw: bigint | string, decimals: number) => Number(BigInt(raw)) / 10 ** decimals;

/** Short-lived quote cache: the panel re-asks as you type. */
const cache = new Map<string, { at: number; body: unknown }>();

export async function tradeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/quote", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const p = tradeBody.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Bad quote request." });
    const { basket, side, amount, currency } = p.data;
    const key = JSON.stringify(p.data);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 10_000) return hit.body;

    const b = await basketView(basket);
    if (!b) return reply.code(404).send({ error: "No such basket." });
    const legs = await legsOf(b.id);
    if (legs.length === 0) return reply.code(409).send({ error: "This basket isn't priced yet." });

    const curMint = currency === "SOL" ? SOL_MINT : USDC_MINT;
    const curDec = currency === "SOL" ? 9 : 6;
    const curPrice = currency === "USDC" ? 1 : ((await one<{ p: number }>(`SELECT usd_price::float8 AS p FROM assets WHERE mint = $1`, [SOL_MINT]))?.p ?? 0);
    const oldest = legs.reduce<Date | null>((m, l) => {
      const d = l.price_at ? new Date(l.price_at) : null;
      return !d ? m : !m || d < m ? d : m;
    }, null);
    const fresh = checkFresh(limits(), oldest);

    let body: Record<string, unknown>;
    if (side === "buy") {
      const raw = toRaw(amount, curDec);
      const split = splitByWeight(raw, legs.map((l) => l.weight_bps));
      const out = await Promise.all(
        legs.map(async (l, i) => {
          if (l.mint === curMint) return { symbol: l.symbol, in: fromRaw(split[i], curDec), out: fromRaw(split[i], l.decimals), impactPct: 0, route: "direct" };
          try {
            const q = await jupQuote(curMint, l.mint, split[i], config.MAX_SLIPPAGE_BPS);
            return {
              symbol: l.symbol,
              in: fromRaw(split[i], curDec),
              out: fromRaw(q.outAmount, l.decimals),
              minOut: fromRaw(q.otherAmountThreshold, l.decimals),
              impactPct: Number(q.priceImpactPct) * 100,
              route: q.routePlan.map((r) => r.swapInfo.label).filter(Boolean).join(" → "),
            };
          } catch (err) {
            return { symbol: l.symbol, in: fromRaw(split[i], curDec), error: (err as Error).message };
          }
        }),
      );
      const acquiredUsd = out.reduce((s, o) => s + ("out" in o && o.out ? o.out * (legs.find((l) => l.symbol === o.symbol)!.usd_price) : 0), 0);
      body = { side, legs: out, usdIn: amount * curPrice, acquiredUsd, shares: acquiredUsd / b.price, nav: b.price };
    } else {
      // Per share, the vault holds `units` of each asset.
      const out = await Promise.all(
        legs.map(async (l) => {
          const units = l.units * amount;
          if (side === "redeem") return { symbol: l.symbol, out: units, usd: units * l.usd_price };
          if (l.mint === curMint) return { symbol: l.symbol, out: units, proceeds: units };
          try {
            const q = await jupQuote(l.mint, curMint, toRaw(units, l.decimals), config.MAX_SLIPPAGE_BPS);
            return { symbol: l.symbol, out: units, proceeds: fromRaw(q.outAmount, curDec), impactPct: Number(q.priceImpactPct) * 100 };
          } catch (err) {
            return { symbol: l.symbol, out: units, error: (err as Error).message };
          }
        }),
      );
      const proceeds = out.reduce((s, o) => s + ("proceeds" in o && o.proceeds ? o.proceeds : 0), 0);
      body = { side, legs: out, shares: amount, nav: b.price, valueUsd: amount * b.price, proceeds: side === "sell" ? proceeds : undefined };
    }
    body = {
      ...body,
      basket: b.code,
      currency,
      slippageBps: config.MAX_SLIPPAGE_BPS,
      fresh: fresh.ok,
      priceAgeSec: oldest ? Math.round((Date.now() - oldest.getTime()) / 1000) : null,
      trading: config.TRADING_ENABLED,
      swaps: legs.length,
    };
    cache.set(key, { at: Date.now(), body });
    return body;
  });

  app.post("/api/orders", async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    const p = tradeBody.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Bad order." });
    const t = checkTrading(limits());
    if (!t.ok) return reply.code(403).send({ error: t.reason, code: t.code });

    const b = await basketView(p.data.basket);
    if (!b) return reply.code(404).send({ error: "No such basket." });
    const { side, amount, currency } = p.data;
    if (side !== "buy" && !b.shareMint) return reply.code(409).send({ error: "Nobody holds this basket yet." });
    if ((await legsOf(b.id)).length === 0) return reply.code(409).send({ error: "This basket isn't priced yet — try again in a minute." });
    const solPrice = (await one<{ p: number }>(`SELECT usd_price::float8 AS p FROM assets WHERE mint = $1`, [SOL_MINT]))?.p ?? 0;
    const usdValue = side === "buy" ? amount * (currency === "USDC" ? 1 : solPrice) : amount * b.price;
    const size = checkOrderSize(limits(), usdValue);
    if (!size.ok) return reply.code(400).send({ error: size.reason, code: size.code });

    const decimals = side === "buy" ? (currency === "SOL" ? 9 : 6) : 6;
    const id = randomId(10);
    await query(
      `INSERT INTO orders (id, user_id, basket_id, side, currency, amount, amount_raw) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, u.id, b.id, side, currency, amount, String(toRaw(amount, decimals))],
    );
    const vault = await vaultAddress();
    return {
      order: { id, status: "awaiting_deposit" },
      deposit: {
        to: vault,
        mint: side === "buy" ? (currency === "SOL" ? "SOL" : USDC_MINT) : b.shareMint,
        amount,
        amountRaw: String(toRaw(amount, decimals)),
        decimals,
      },
      custodial: u.custodial,
    };
  });

  app.get<{ Params: { id: string } }>("/api/orders/:id", async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    const o = await one(`SELECT id, basket_id, side, currency, amount::float8 AS amount, status, deposit_sig, result, error, created_at FROM orders WHERE id = $1 AND user_id = $2`, [
      req.params.id,
      u.id,
    ]);
    if (!o) return reply.code(404).send({ error: "No such order." });
    return { order: o };
  });

  /** Custodial wallets: we sign the payment from the user's own sealed wallet. */
  app.post<{ Params: { id: string } }>("/api/orders/:id/pay", async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    const own = await one(`SELECT 1 AS x FROM orders WHERE id = $1 AND user_id = $2`, [req.params.id, u.id]);
    if (!own) return reply.code(404).send({ error: "No such order." });
    const r = await signer<string>("/pay", { orderId: req.params.id });
    if (!r.ok) return reply.code(r.code === "trading_off" ? 403 : r.code === "funds" ? 402 : 502).send({ error: r.error, code: r.code });
    return { signature: r.result, status: "paid" };
  });

  /** Non-custodial wallets: they paid from Phantom; we read the chain to confirm. */
  app.post<{ Params: { id: string }; Body: { signature?: string } }>("/api/orders/:id/deposit", async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    const sig = String(req.body?.signature ?? "");
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(sig)) return reply.code(400).send({ error: "Bad signature." });
    const o = await one<{ id: string; side: string; currency: string; amount_raw: string; basket_id: string; status: string }>(
      `SELECT id, side, currency, amount_raw::text AS amount_raw, basket_id, status FROM orders WHERE id = $1 AND user_id = $2`,
      [req.params.id, u.id],
    );
    if (!o) return reply.code(404).send({ error: "No such order." });
    if (o.status !== "awaiting_deposit") return reply.code(409).send({ error: `Order is ${o.status}.` });

    const tx = await parsedTx(sig).catch(() => null);
    if (!tx) return reply.code(409).send({ error: "Transaction not found yet — try again in a few seconds." });
    if (!signedBy(tx, u.wallet)) return reply.code(400).send({ error: "That transaction wasn't sent from your wallet." });
    const vault = await vaultAddress();
    const share = await one<{ share_mint: string | null }>(`SELECT share_mint FROM baskets WHERE id = $1`, [o.basket_id]);
    const mint = o.side === "buy" ? (o.currency === "SOL" ? "SOL" : USDC_MINT) : share?.share_mint;
    if (!mint) return reply.code(409).send({ error: "Basket not deployed." });
    const got = received(tx, vault, mint);
    if (got < BigInt(o.amount_raw)) return reply.code(400).send({ error: "That transaction didn't pay the full amount to the vault." });

    const ok = await one(
      `UPDATE orders SET deposit_sig = $2, status = 'paid', updated_at = now() WHERE id = $1 AND status = 'awaiting_deposit' RETURNING id`,
      [o.id, sig],
    ).catch(() => null);
    if (!ok) return reply.code(409).send({ error: "That transaction was already used." });
    return { status: "paid" };
  });

  /**
   * What the browser needs to build a payment without talking to an RPC itself
   * (public RPCs refuse browsers): a fresh blockhash and the mint's token program.
   */
  app.get<{ Querystring: { mint?: string } }>("/api/chain/prep", async (req, reply) => {
    const mint = req.query.mint ?? "SOL";
    if (mint !== "SOL" && !isAddress(mint)) return reply.code(400).send({ error: "Bad mint." });
    const { blockhash, lastValidBlockHeight } = await rpc().getLatestBlockhash(COMMITMENT);
    const program = mint === "SOL" ? null : (await programOf(new PublicKey(mint))).toBase58();
    return { blockhash, lastValidBlockHeight, program };
  });

  /** Build your own basket: listed assets, weights to 100%, its own page and chart. */
  const createBody = z.object({
    name: z.string().trim().min(2).max(40),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,6}$/),
    description: z.string().trim().max(160).default(""),
    rebalance: z.string().trim().max(60).default("Every 30 days or 5% drift"),
    access: z.enum(["public", "private"]).default("public"),
    weights: z.array(z.object({ symbol: z.string(), weight: z.number().positive() })).min(1),
  });

  app.post("/api/baskets", { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    const p = createBody.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Give it a name, a 2–6 letter ticker and some assets." });
    const d = p.data;

    // Percent → basis points, rounding dust onto the largest weight so it sums to exactly 100%.
    const total = d.weights.reduce((s, w) => s + w.weight, 0);
    const bps = d.weights.map((w) => ({ symbol: w.symbol, weight_bps: Math.round((w.weight / total) * 10_000) }));
    const drift = 10_000 - bps.reduce((s, w) => s + w.weight_bps, 0);
    bps.sort((a, b) => b.weight_bps - a.weight_bps)[0].weight_bps += drift;
    const shape = checkBasketShape(limits(), bps);
    if (!shape.ok) return reply.code(400).send({ error: shape.reason });

    const { rows: priced } = await query<{ symbol: string; usd_price: number }>(
      `SELECT symbol, usd_price::float8 AS usd_price FROM assets WHERE listed AND usd_price IS NOT NULL AND symbol = ANY($1)`,
      [bps.map((w) => w.symbol)],
    );
    if (priced.length !== bps.length) return reply.code(400).send({ error: "Some of those assets aren't listed right now." });
    const taken = await one(`SELECT 1 AS x FROM baskets WHERE upper(code) = $1`, [d.code]);
    if (taken) return reply.code(409).send({ error: `$${d.code} is taken.` });

    const id = `${d.code.toLowerCase()}-${randomId(3)}`;
    const units = unitsFor(bps, Object.fromEntries(priced.map((x) => [x.symbol, x.usd_price])), 100);
    await query(
      `INSERT INTO baskets (id, code, name, description, creator_id, rebalance, access) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, d.code, d.name, d.description, u.id, d.rebalance, d.access],
    );
    for (const w of bps) {
      await query(`INSERT INTO basket_holdings (basket_id, symbol, weight_bps, units) VALUES ($1, $2, $3, $4)`, [id, w.symbol, w.weight_bps, units[w.symbol]]);
    }
    return { basket: await basketView(id) };
  });

}
