import Fastify, { type FastifyInstance } from "fastify";
import { Keypair } from "@solana/web3.js";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { one, query } from "../db.js";
import { log } from "../logger.js";
import { safeEqual } from "../util/crypto.js";
import { exportSecret, openCustodial, openVault, type SealedRow } from "../chain/wallet.js";
import { parsedTx, received } from "../chain/rpc.js";
import { quote, swapTransaction } from "../chain/jupiter.js";
import { ATA_RENT, FEE_ESTIMATE, burnShares, createShareMint, mintRent, mintShares, sendVersioned, transfer, type Sent } from "../chain/spl.js";
import { SOL_MINT, USDC_MINT } from "../catalog.js";
import { checkBudget, checkFresh, checkOrderSize, checkTrading, splitByWeight, type Verdict } from "../policy/engine.js";
import { limits, spentLamports } from "../policy/limits.js";

/**
 * The signer — the only process that opens a key. It listens on localhost (or
 * the compose network) behind a shared token, and every call re-checks the
 * limits with its own copy of the policy engine before anything is signed.
 *
 * What it does, all of it:
 *  - deploy a basket's share mint (vault is the mint authority),
 *  - move a custodial user's payment into the vault,
 *  - execute an order: swap the payment into the basket (price-limited legs),
 *    mint shares; or burn shares and pay out the exact underlying (redeem) or
 *    its value in USDC/SOL (sell),
 *  - export a custodial user's key to its owner.
 *
 * Every SOL the vault pays (fees, rent) is written to `spend_ledger` and the
 * lifetime total can never pass MAX_TOTAL_SPEND_LAMPORTS.
 */

class Refused extends Error {
  constructor(public v: Exclude<Verdict, { ok: true }>) {
    super(v.reason);
  }
}
const must = (v: Verdict) => {
  if (!v.ok) throw new Refused(v);
};

async function spend(estimate: number, reason: string, run: () => Promise<Sent>): Promise<Sent> {
  must(checkTrading(limits()));
  must(checkBudget(limits(), await spentLamports(), estimate));
  const sent = await run();
  await query(`INSERT INTO spend_ledger (lamports, reason, sig) VALUES ($1, $2, $3)`, [sent.costLamports, reason, sent.sig]);
  return sent;
}

interface HoldingExec {
  symbol: string;
  weight_bps: number;
  units: number;
  vault_raw: string;
  mint: string;
  decimals: number;
  usd_price: number;
  price_at: string | null;
}

const holdingsForExec = async (basketId: string) =>
  (
    await query<HoldingExec>(
      `SELECT h.symbol, h.weight_bps, h.units::float8 AS units, h.vault_raw::text AS vault_raw,
              a.mint, a.decimals, a.usd_price::float8 AS usd_price, a.price_at::text AS price_at
         FROM basket_holdings h JOIN assets a ON a.symbol = h.symbol
        WHERE h.basket_id = $1 AND a.listed AND a.mint IS NOT NULL AND a.usd_price IS NOT NULL AND h.units > 0`,
      [basketId],
    )
  ).rows;

const currencyMint = (c: string) => (c === "SOL" ? SOL_MINT : USDC_MINT);
const currencyDecimals = (c: string) => (c === "SOL" ? 9 : 6);

/* ------------------------------------------------------------------- deploy */

async function deployBasket(basketId: string): Promise<string> {
  const b = await one<{ share_mint: string | null; share_decimals: number }>(
    `SELECT share_mint, share_decimals FROM baskets WHERE id = $1`,
    [basketId],
  );
  if (!b) throw new Error("no such basket");
  if (b.share_mint) return b.share_mint;
  const vault = await openVault();
  const mint = Keypair.generate();
  await spend((await mintRent()) + FEE_ESTIMATE, `deploy ${basketId}`, () => createShareMint(vault, mint, b.share_decimals));
  await query(`UPDATE baskets SET share_mint = $2 WHERE id = $1 AND share_mint IS NULL`, [basketId, mint.publicKey.toBase58()]);
  log.info({ basketId, mint: mint.publicKey.toBase58() }, "basket deployed");
  return mint.publicKey.toBase58();
}

/* ------------------------------------------------------------------- orders */

interface OrderRow {
  id: string;
  user_id: string;
  basket_id: string;
  side: "buy" | "sell" | "redeem";
  currency: "USDC" | "SOL";
  amount: number;
  amount_raw: string;
  status: string;
  wallet: string;
}

const loadOrder = async (id: string) =>
  one<OrderRow>(
    `SELECT o.id, o.user_id, o.basket_id, o.side, o.currency, o.amount::float8 AS amount, o.amount_raw::text AS amount_raw,
            o.status, u.wallet
       FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
    [id],
  );

/** A custodial user pays: their own wallet signs a plain transfer into the vault. */
async function payCustodial(orderId: string): Promise<string> {
  const o = await loadOrder(orderId);
  if (!o || o.status !== "awaiting_deposit") throw new Error("order is not awaiting payment");
  must(checkTrading(limits()));
  const u = await one<SealedRow & { custodial: boolean }>(
    `SELECT wallet, sealed_nonce, sealed_key, custodial FROM users WHERE id = $1`,
    [o.user_id],
  );
  if (!u?.custodial) throw new Error("not a custodial wallet");
  const user = openCustodial(u);
  const vault = (await openVault()).publicKey.toBase58();
  const b = await one<{ share_mint: string | null }>(`SELECT share_mint FROM baskets WHERE id = $1`, [o.basket_id]);
  const mint = o.side === "buy" ? (o.currency === "SOL" ? "SOL" : USDC_MINT) : b?.share_mint;
  if (!mint) throw new Error("basket not deployed");
  const decimals = o.side === "buy" ? currencyDecimals(o.currency) : 6;
  // The user's wallet pays its own fee — this never touches the vault budget.
  const sent = await transfer(user, user, mint, vault, BigInt(o.amount_raw), decimals);
  await query(`UPDATE orders SET deposit_sig = $2, status = 'paid', updated_at = now() WHERE id = $1`, [o.id, sent.sig]);
  return sent.sig;
}

async function executeBuy(o: OrderRow): Promise<Record<string, unknown>> {
  const shareMint = await deployBasket(o.basket_id);
  const vault = await openVault();
  const vaultAddr = vault.publicKey.toBase58();
  const holdings = await holdingsForExec(o.basket_id);
  if (holdings.length === 0) throw new Error("basket has no priced holdings");
  for (const h of holdings) must(checkFresh(limits(), h.price_at ? new Date(h.price_at) : null));

  const inMint = currencyMint(o.currency);
  const inPrice = (await one<{ p: number }>(`SELECT usd_price::float8 AS p FROM assets WHERE mint = $1`, [inMint]))?.p ?? (o.currency === "USDC" ? 1 : 0);
  must(checkOrderSize(limits(), o.amount * inPrice));

  const legs = splitByWeight(BigInt(o.amount_raw), holdings.map((h) => h.weight_bps));
  const fills: { symbol: string; inRaw: string; outRaw: string; sig: string | null }[] = [];
  for (let i = 0; i < holdings.length; i++) {
    const h = holdings[i];
    const inRaw = legs[i];
    if (inRaw === 0n) continue;
    if (h.mint === inMint) {
      fills.push({ symbol: h.symbol, inRaw: String(inRaw), outRaw: String(inRaw), sig: null });
      continue;
    }
    const q = await quote(inMint, h.mint, inRaw, config.MAX_SLIPPAGE_BPS);
    const swap = await swapTransaction(q, vaultAddr);
    const sent = await spend(ATA_RENT + FEE_ESTIMATE * 4, `buy ${o.id} ${h.symbol}`, () => sendVersioned(vault, swap));
    const tx = await parsedTx(sent.sig);
    const got = tx ? received(tx, vaultAddr, h.mint === SOL_MINT ? "SOL" : h.mint) : 0n;
    const outRaw = got > 0n ? got : BigInt(q.otherAmountThreshold);
    fills.push({ symbol: h.symbol, inRaw: String(inRaw), outRaw: String(outRaw), sig: sent.sig });
  }

  // Shares for what was actually bought, at the basket's live share price.
  const acquiredUsd = fills.reduce((s, f) => {
    const h = holdings.find((x) => x.symbol === f.symbol)!;
    return s + (Number(f.outRaw) / 10 ** h.decimals) * h.usd_price;
  }, 0);
  const nav = holdings.reduce((s, h) => s + h.units * h.usd_price, 0);
  const sharesRaw = BigInt(Math.floor((acquiredUsd / nav) * 1e6));
  const mintSent = await spend(ATA_RENT + FEE_ESTIMATE, `mint ${o.id}`, () => mintShares(vault, shareMint, o.wallet, sharesRaw));

  for (const f of fills) {
    await query(`UPDATE basket_holdings SET vault_raw = vault_raw + $3::bigint WHERE basket_id = $1 AND symbol = $2`, [o.basket_id, f.symbol, f.outRaw]);
  }
  await query(`UPDATE baskets SET shares_raw = shares_raw + $2::bigint WHERE id = $1`, [o.basket_id, String(sharesRaw)]);
  await query(
    `INSERT INTO holdings_by_user (user_id, basket_id, shares_raw) VALUES ($1, $2, $3::bigint)
     ON CONFLICT (user_id, basket_id) DO UPDATE SET shares_raw = holdings_by_user.shares_raw + EXCLUDED.shares_raw`,
    [o.user_id, o.basket_id, String(sharesRaw)],
  );
  return { fills, shares: Number(sharesRaw) / 1e6, acquiredUsd, nav, mintSig: mintSent.sig };
}

/** Redeem pays out the exact underlying; sell swaps it to the order currency first. */
async function executeExit(o: OrderRow): Promise<Record<string, unknown>> {
  const b = await one<{ share_mint: string; shares_raw: string }>(`SELECT share_mint, shares_raw::text AS shares_raw FROM baskets WHERE id = $1`, [o.basket_id]);
  if (!b?.share_mint) throw new Error("basket not deployed");
  const vault = await openVault();
  const vaultAddr = vault.publicKey.toBase58();
  const sharesRaw = BigInt(o.amount_raw);
  const supply = BigInt(b.shares_raw);
  if (sharesRaw <= 0n || sharesRaw > supply) throw new Error("share amount out of range");

  const holdings = await holdingsForExec(o.basket_id);
  await spend(FEE_ESTIMATE, `burn ${o.id}`, () => burnShares(vault, b.share_mint, sharesRaw));

  const outs: { symbol: string; outRaw: string; sig: string }[] = [];
  let proceeds = 0n;
  const outMint = currencyMint(o.currency);
  for (const h of holdings) {
    const slice = (BigInt(h.vault_raw) * sharesRaw) / supply;
    if (slice === 0n) continue;
    await query(`UPDATE basket_holdings SET vault_raw = vault_raw - $3::bigint WHERE basket_id = $1 AND symbol = $2`, [o.basket_id, h.symbol, String(slice)]);
    if (o.side === "redeem") {
      const sent = await spend(ATA_RENT + FEE_ESTIMATE, `redeem ${o.id} ${h.symbol}`, () =>
        transfer(vault, vault, h.mint === SOL_MINT ? "SOL" : h.mint, o.wallet, slice, h.decimals),
      );
      outs.push({ symbol: h.symbol, outRaw: String(slice), sig: sent.sig });
    } else if (h.mint === outMint) {
      proceeds += slice;
    } else {
      must(checkFresh(limits(), h.price_at ? new Date(h.price_at) : null));
      const q = await quote(h.mint, outMint, slice, config.MAX_SLIPPAGE_BPS);
      const swap = await swapTransaction(q, vaultAddr);
      const sent = await spend(ATA_RENT + FEE_ESTIMATE * 4, `sell ${o.id} ${h.symbol}`, () => sendVersioned(vault, swap));
      const tx = await parsedTx(sent.sig);
      const got = tx ? received(tx, vaultAddr, outMint === SOL_MINT ? "SOL" : outMint) : 0n;
      proceeds += got > 0n ? got : BigInt(q.otherAmountThreshold);
      outs.push({ symbol: h.symbol, outRaw: String(slice), sig: sent.sig });
    }
  }
  let payout: string | null = null;
  if (o.side === "sell" && proceeds > 0n) {
    const sent = await spend(ATA_RENT + FEE_ESTIMATE, `payout ${o.id}`, () =>
      transfer(vault, vault, o.currency === "SOL" ? "SOL" : USDC_MINT, o.wallet, proceeds, currencyDecimals(o.currency)),
    );
    payout = sent.sig;
  }
  await query(`UPDATE baskets SET shares_raw = shares_raw - $2::bigint WHERE id = $1`, [o.basket_id, String(sharesRaw)]);
  await query(`UPDATE holdings_by_user SET shares_raw = GREATEST(0, shares_raw - $3::bigint) WHERE user_id = $1 AND basket_id = $2`, [
    o.user_id,
    o.basket_id,
    String(sharesRaw),
  ]);
  return { outs, proceedsRaw: String(proceeds), payoutSig: payout };
}

async function execute(orderId: string): Promise<Record<string, unknown>> {
  // Take the order atomically: only one executor ever moves it past `paid`.
  const taken = await one<{ id: string }>(
    `UPDATE orders SET status = 'executing', updated_at = now() WHERE id = $1 AND status = 'paid' RETURNING id`,
    [orderId],
  );
  if (!taken) throw new Error("order is not ready to execute");
  const o = (await loadOrder(orderId))!;
  try {
    const result = o.side === "buy" ? await executeBuy(o) : await executeExit(o);
    await query(`UPDATE orders SET status = 'filled', result = $2, updated_at = now() WHERE id = $1`, [o.id, JSON.stringify(result)]);
    return result;
  } catch (err) {
    const refused = err instanceof Refused;
    await query(`UPDATE orders SET status = $2, error = $3, updated_at = now() WHERE id = $1`, [
      o.id,
      refused ? "refused" : "failed",
      (err as Error).message,
    ]);
    throw err;
  }
}

/* -------------------------------------------------------------------- export */

async function exportKey(userId: string): Promise<string> {
  const u = await one<SealedRow & { custodial: boolean }>(`SELECT wallet, sealed_nonce, sealed_key, custodial FROM users WHERE id = $1`, [userId]);
  if (!u?.custodial) throw new Error("not a custodial wallet");
  return exportSecret(openCustodial(u));
}

/* --------------------------------------------------------------------- serve */

export function buildSigner(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health") return;
    const token = (req.headers["x-signer-token"] as string) ?? "";
    if (!safeEqual(token, config.SIGNER_TOKEN)) return reply.code(401).send({ error: "unauthorized" });
  });
  const wrap = <B>(fn: (b: B) => Promise<unknown>) => async (req: { body: unknown }, reply: { code: (n: number) => { send: (x: unknown) => unknown } }) => {
    try {
      return { ok: true, result: await fn(req.body as B) };
    } catch (err) {
      const refused = err instanceof Refused;
      log.warn({ err: (err as Error).message }, refused ? "signer refused" : "signer failed");
      return reply.code(refused ? 403 : 500).send({ ok: false, code: refused ? err.v.code : "failed", error: (err as Error).message });
    }
  };
  app.get("/health", async () => ({ ok: true, trading: config.TRADING_ENABLED }));
  app.post("/deploy", wrap<{ basketId: string }>((b) => deployBasket(b.basketId)));
  app.post("/pay", wrap<{ orderId: string }>((b) => payCustodial(b.orderId)));
  app.post("/execute", wrap<{ orderId: string }>((b) => execute(b.orderId)));
  app.post("/export", wrap<{ userId: string }>((b) => exportKey(b.userId)));
  return app;
}

export async function startSigner(): Promise<void> {
  const app = buildSigner();
  await app.listen({ port: config.SIGNER_PORT, host: config.SIGNER_HOST });
  log.info({ port: config.SIGNER_PORT, host: config.SIGNER_HOST, trading: config.TRADING_ENABLED }, "signer listening");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startSigner().catch((err) => {
    log.error({ err }, "signer failed to start");
    process.exit(1);
  });
}
