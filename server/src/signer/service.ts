import Fastify, { type FastifyInstance } from "fastify";
import { Keypair } from "@solana/web3.js";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { one, query } from "../db.js";
import { log } from "../logger.js";
import { randomId, safeEqual } from "../util/crypto.js";
import { exportSecret, openCustodial, openVault, type SealedRow } from "../chain/wallet.js";
import { chain } from "../chain/port.js";
import { ATA_RENT, PLAIN_TX, SWAP_TX, TxFailed, type Sent } from "../chain/spl.js";
import { SOL_MINT, USDC_MINT } from "../catalog.js";
import { checkBudget, checkFresh, checkOrderSize, feeOnFilled, platformFee, splitByWeight, type Verdict } from "../policy/engine.js";
import { limits, spentLamports, tradingGate } from "../policy/limits.js";
import { bookFee } from "../services/costs.js";
import { checkWalletFunds, markPaid } from "../services/orders.js";
import { siteLinks } from "../services/site-links.js";

/**
 * The signer — the only process that opens a key. It listens on localhost (or
 * the compose network) behind a shared token, and every call re-checks the
 * limits with its own copy of the policy engine before anything is signed.
 *
 * What it does, all of it:
 *  - open a basket's share mint (vault is the mint authority),
 *  - move a custodial user's payment into the vault,
 *  - execute an order: swap the payment into the basket (price-limited legs) and
 *    mint shares; or burn shares and pay out the exact underlying (redeem) or its
 *    value in USDC/SOL (sell), less the platform's commission,
 *  - send everything owed to a user through the payout queue,
 *  - withdraw the commission to the treasury, or spend it on the $ASTRA buyback,
 *  - export a custodial user's key to its owner.
 *
 * Money can't get stuck on a failure. Anything that stops a buy before it fills
 * refunds the whole payment; a leg that can't fill is refunded on its own; shares
 * go back if the burn fails; a sell leg that can't swap pays the token itself.
 * All of that goes in `payouts`, which is retried until it lands and asks the
 * chain before ever sending twice. Refunds and exits are never blocked by the
 * spend cap: they are the user's money, and the user has prepaid their fees.
 *
 * What the platform pays from its own pocket (`spend_ledger`, net of what buyers
 * prepaid) can never pass MAX_TOTAL_SPEND_LAMPORTS.
 */

class Refused extends Error {
  constructor(public v: Exclude<Verdict, { ok: true }>) {
    super(v.reason);
  }
}
const must = (v: Verdict) => {
  if (!v.ok) throw new Refused(v);
};

/** How long an unconfirmed attempt may still land: past this its blockhash is dead. */
const BLOCKHASH_LIFE_MS = 120_000;
const MAX_PAYOUT_ATTEMPTS = 12;
/** Prepaid fee worth sending back after a full refund; below this it costs more to send. */
const MIN_CHANGE = 50_000;

interface SpendOptions {
  orderId?: string;
  /** Money owed to a user: goes out regardless of the switch and the cap. */
  owed?: boolean;
}

/** Runs the jobs given to it strictly one after another. */
const oneAtATime = () => {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const next = last.then(job, job);
    last = next.catch(() => undefined);
    return next;
  };
};

/**
 * What's on its way to the chain and not in the ledger yet. Checking the budget
 * and booking a cost take turns, so spends that overlap can't each see the same
 * room left under the cap.
 */
let inFlight = 0;
const budgetTurn = oneAtATime();

async function spend(estimate: number, reason: string, run: () => Promise<Sent>, opts: SpendOptions = {}): Promise<Sent> {
  await budgetTurn(async () => {
    if (!opts.owed) {
      must(await tradingGate());
      must(checkBudget(limits(), (await spentLamports()) + inFlight, estimate));
    }
    inFlight += estimate;
  });
  const settle = (lamports: number | null, why: string, sig: string | null) =>
    budgetTurn(async () => {
      inFlight -= estimate;
      if (lamports !== null) await query(`INSERT INTO spend_ledger (lamports, reason, sig, order_id) VALUES ($1, $2, $3, $4)`, [lamports, why, sig, opts.orderId ?? null]);
    });
  const sent = await run().catch(async (err: unknown) => {
    // It reached the chain and failed: the fee is gone all the same.
    await settle(err instanceof TxFailed ? err.costLamports : null, `failed: ${reason}`, null);
    throw err;
  });
  await settle(sent.costLamports, reason, sent.sig);
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

const HOLDING_COLS = `h.symbol, h.weight_bps, h.units::float8 AS units, h.vault_raw::text AS vault_raw,
  a.mint, a.decimals, a.usd_price::float8 AS usd_price, a.price_at::text AS price_at`;

const holdingsForBuy = async (basketId: string) =>
  (
    await query<HoldingExec>(
      `SELECT ${HOLDING_COLS} FROM basket_holdings h JOIN assets a ON a.symbol = h.symbol
        WHERE h.basket_id = $1 AND a.listed AND a.mint IS NOT NULL AND a.usd_price IS NOT NULL AND h.units > 0`,
      [basketId],
    )
  ).rows;

/** On the way out everything the basket holds counts, even an asset since delisted or unpriced. */
const holdingsForExit = async (basketId: string) =>
  (
    await query<HoldingExec>(
      `SELECT ${HOLDING_COLS} FROM basket_holdings h JOIN assets a ON a.symbol = h.symbol
        WHERE h.basket_id = $1 AND a.mint IS NOT NULL AND h.vault_raw > 0`,
      [basketId],
    )
  ).rows;

const currencyMint = (c: string) => (c === "SOL" ? SOL_MINT : USDC_MINT);
const currencyDecimals = (c: string) => (c === "SOL" ? 9 : 6);
const payoutMint = (mint: string) => (mint === SOL_MINT ? "SOL" : mint);
const SHARE_DECIMALS = 6;

/** A swap's fee, plus the rent if it will open the vault's account for this token. */
async function legEstimate(mint: string, vaultAddr: string): Promise<number> {
  if (mint === SOL_MINT) return SWAP_TX;
  try {
    const [open] = await chain.accountsExist([{ mint, owner: vaultAddr }]);
    return open ? SWAP_TX : SWAP_TX + (await chain.ataRent(mint));
  } catch {
    return SWAP_TX + ATA_RENT;
  }
}

/* ------------------------------------------------------------------- deploy */

async function deployBasket(basketId: string, orderId?: string): Promise<string> {
  const b = await one<{ share_mint: string | null; share_decimals: number }>(
    `SELECT share_mint, share_decimals FROM baskets WHERE id = $1`,
    [basketId],
  );
  if (!b) throw new Error("no such basket");
  if (b.share_mint) return b.share_mint;
  const vault = await openVault();
  const mint = Keypair.generate();
  await spend((await chain.mintRent()) + PLAIN_TX, `deploy ${basketId}`, () => chain.createShareMint(vault, mint, b.share_decimals), { orderId });
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
  network_fee_lamports: string;
  platform_fee_raw: string;
  quote: { setupPaidBy?: string } | null;
}

const loadOrder = async (id: string) =>
  one<OrderRow>(
    `SELECT o.id, o.user_id, o.basket_id, o.side, o.currency, o.amount::float8 AS amount, o.amount_raw::text AS amount_raw,
            o.status, u.wallet, o.network_fee_lamports::text AS network_fee_lamports,
            o.platform_fee_raw::text AS platform_fee_raw, o.quote
       FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
    [id],
  );

/** A custodial user pays: their own wallet signs one transfer into the vault, order and network fee together. */
async function payCustodial(orderId: string): Promise<string> {
  const o = await loadOrder(orderId);
  if (!o || o.status !== "awaiting_deposit") throw new Error("order is not awaiting payment");
  must(await tradingGate());
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
  const decimals = o.side === "buy" ? currencyDecimals(o.currency) : SHARE_DECIMALS;
  const network = BigInt(o.network_fee_lamports);
  must(await checkWalletFunds(u.wallet, mint, BigInt(o.amount_raw), Number(network) + ATA_RENT, o.side === "buy" ? o.currency : "shares"));
  const sent = await chain.payIn(user, mint, vault, BigInt(o.amount_raw), decimals, network);
  if (!(await markPaid(o.id, sent.sig, network))) throw new Error("order was already paid");
  return sent.sig;
}

const queuePayout = (o: OrderRow, mint: string, raw: bigint, decimals: number, reason: string) =>
  query(`INSERT INTO payouts (order_id, wallet, mint, raw, decimals, reason) VALUES ($1, $2, $3, $4::bigint, $5, $6)`, [
    o.id,
    o.wallet,
    mint,
    String(raw),
    decimals,
    reason,
  ]);

/** What's left of the prepaid network fee after a refund: back to the user, if it's worth a transaction. */
async function returnChange(o: OrderRow): Promise<void> {
  const prepaid = Number(o.network_fee_lamports);
  if (prepaid <= 0) return;
  // A share mint the platform agreed to pay for isn't charged to this order.
  const notTheirs = o.quote?.setupPaidBy === "platform" ? `AND reason NOT LIKE 'deploy %'` : "";
  const row = await one<{ s: string }>(`SELECT COALESCE(sum(lamports), 0)::text AS s FROM spend_ledger WHERE order_id = $1 AND lamports > 0 ${notTheirs}`, [o.id]);
  const left = prepaid - Number(row?.s ?? 0) - 2 * PLAIN_TX;
  if (left < MIN_CHANGE) return;
  await queuePayout(o, "SOL", BigInt(left), 9, "change");
  await query(`INSERT INTO spend_ledger (lamports, reason, order_id) VALUES ($1, 'change returned', $2)`, [left, o.id]);
}

interface Executed extends Record<string, unknown> {
  settlesTo: "filled" | "refunded";
}

async function refundWhole(o: OrderRow, why: string): Promise<Executed> {
  log.warn({ order: o.id, why }, "buy refunded in full");
  await queuePayout(o, o.currency === "SOL" ? "SOL" : USDC_MINT, BigInt(o.amount_raw), currencyDecimals(o.currency), "refund");
  await returnChange(o);
  return { settlesTo: "refunded", why };
}

async function executeBuy(o: OrderRow): Promise<Executed> {
  const amount = BigInt(o.amount_raw);
  const fee = BigInt(o.platform_fee_raw);
  const investable = amount - fee;
  const inMint = currencyMint(o.currency);

  // Anything that stops the order before a swap sends the whole payment back.
  let holdings: HoldingExec[];
  let shareMint: string;
  try {
    must(await tradingGate());
    holdings = await holdingsForBuy(o.basket_id);
    if (holdings.length === 0) throw new Error("This basket isn't priced right now.");
    for (const h of holdings) must(checkFresh(limits(), h.price_at ? new Date(h.price_at) : null));
    const inPrice = (await one<{ p: number }>(`SELECT usd_price::float8 AS p FROM assets WHERE mint = $1`, [inMint]))?.p ?? (o.currency === "USDC" ? 1 : 0);
    must(checkOrderSize(limits(), o.amount * inPrice));
    shareMint = await deployBasket(o.basket_id, o.id);
  } catch (err) {
    return refundWhole(o, (err as Error).message);
  }

  const vault = await openVault();
  const vaultAddr = vault.publicKey.toBase58();
  const legs = splitByWeight(investable, holdings.map((h) => h.weight_bps));
  const fills: { symbol: string; inRaw: bigint; outRaw: bigint; sig: string | null }[] = [];
  const missed: { symbol: string; inRaw: bigint; error: string }[] = [];
  for (let i = 0; i < holdings.length; i++) {
    const h = holdings[i];
    const inRaw = legs[i];
    if (inRaw === 0n) continue;
    if (h.mint === inMint) {
      fills.push({ symbol: h.symbol, inRaw, outRaw: inRaw, sig: null });
      continue;
    }
    try {
      const q = await chain.quote(inMint, h.mint, inRaw, config.MAX_SLIPPAGE_BPS);
      const swap = await chain.swapTransaction(q, vaultAddr);
      const sent = await spend(await legEstimate(h.mint, vaultAddr), `buy ${o.id} ${h.symbol}`, () => chain.sendVersioned(vault, swap), { orderId: o.id });
      const got = await chain.receivedIn(sent.sig, vaultAddr, payoutMint(h.mint));
      fills.push({ symbol: h.symbol, inRaw, outRaw: got && got > 0n ? got : BigInt(q.otherAmountThreshold), sig: sent.sig });
    } catch (err) {
      // A leg that can't fill (no route, slippage, the network) is sent back, not kept.
      log.warn({ order: o.id, symbol: h.symbol, err: (err as Error).message }, "buy leg missed");
      missed.push({ symbol: h.symbol, inRaw, error: (err as Error).message });
    }
  }
  if (fills.length === 0) return refundWhole(o, missed[0]?.error ?? "No leg could fill.");

  // Commission only on what was actually bought; the rest of the payment goes back.
  const filledIn = fills.reduce((s, f) => s + f.inRaw, 0n);
  const feeTaken = feeOnFilled(fee, filledIn, investable);
  await bookFee(o.id, o.currency, feeTaken);
  const unspent = amount - filledIn - feeTaken;

  // Shares for what was actually bought, at the basket's live share price.
  const acquiredUsd = fills.reduce((s, f) => {
    const h = holdings.find((x) => x.symbol === f.symbol)!;
    return s + (Number(f.outRaw) / 10 ** h.decimals) * h.usd_price;
  }, 0);
  const nav = holdings.reduce((s, h) => s + h.units * h.usd_price, 0);
  const sharesRaw = BigInt(Math.floor((acquiredUsd / nav) * 10 ** SHARE_DECIMALS));

  // The tokens are in the vault whatever happens next, so they're booked first,
  // and the shares are owed from this moment: the mint goes through the queue.
  for (const f of fills) {
    await query(`UPDATE basket_holdings SET vault_raw = vault_raw + $3::bigint WHERE basket_id = $1 AND symbol = $2`, [o.basket_id, f.symbol, String(f.outRaw)]);
  }
  await query(`UPDATE baskets SET shares_raw = shares_raw + $2::bigint WHERE id = $1`, [o.basket_id, String(sharesRaw)]);
  await query(
    `INSERT INTO holdings_by_user (user_id, basket_id, shares_raw) VALUES ($1, $2, $3::bigint)
     ON CONFLICT (user_id, basket_id) DO UPDATE SET shares_raw = holdings_by_user.shares_raw + EXCLUDED.shares_raw`,
    [o.user_id, o.basket_id, String(sharesRaw)],
  );
  await queuePayout(o, shareMint, sharesRaw, SHARE_DECIMALS, "shares");
  if (unspent > 0n) await queuePayout(o, o.currency === "SOL" ? "SOL" : USDC_MINT, unspent, currencyDecimals(o.currency), "refund");

  return {
    settlesTo: "filled",
    fills: fills.map((f) => ({ symbol: f.symbol, inRaw: String(f.inRaw), outRaw: String(f.outRaw), sig: f.sig })),
    missed: missed.map((m) => ({ symbol: m.symbol, inRaw: String(m.inRaw), error: m.error })),
    shares: Number(sharesRaw) / 10 ** SHARE_DECIMALS,
    feeRaw: String(feeTaken),
    refundRaw: String(unspent),
    acquiredUsd,
    nav,
  };
}

/** Redeem pays out the exact underlying, no commission; sell swaps it to the order currency and takes the commission. */
async function executeExit(o: OrderRow): Promise<Executed> {
  const owed = { orderId: o.id, owed: true };
  const sharesRaw = BigInt(o.amount_raw);
  const b = await one<{ share_mint: string; shares_raw: string }>(`SELECT share_mint, shares_raw::text AS shares_raw FROM baskets WHERE id = $1`, [o.basket_id]);
  const giveBack = async (why: string): Promise<Executed> => {
    if (b?.share_mint) await queuePayout(o, b.share_mint, sharesRaw, SHARE_DECIMALS, "shares_back");
    await returnChange(o);
    return { settlesTo: "refunded", why };
  };
  if (!b?.share_mint) return giveBack("Basket not deployed.");
  const supply = BigInt(b.shares_raw);
  if (sharesRaw <= 0n || sharesRaw > supply) return giveBack("Share amount out of range.");

  const vault = await openVault();
  const vaultAddr = vault.publicKey.toBase58();
  const holdings = await holdingsForExit(o.basket_id);
  try {
    await spend(PLAIN_TX, `burn ${o.id}`, () => chain.burnShares(vault, b.share_mint, sharesRaw), owed);
  } catch (err) {
    return giveBack((err as Error).message); // nothing has moved yet
  }

  // The shares are gone: book that first, so nothing below can be paid out twice.
  await query(`UPDATE baskets SET shares_raw = shares_raw - $2::bigint WHERE id = $1`, [o.basket_id, String(sharesRaw)]);
  await query(`UPDATE holdings_by_user SET shares_raw = GREATEST(0, shares_raw - $3::bigint) WHERE user_id = $1 AND basket_id = $2`, [
    o.user_id,
    o.basket_id,
    String(sharesRaw),
  ]);

  const outs: { symbol: string; raw: string; sig: string | null; inKind?: boolean }[] = [];
  let proceeds = 0n;
  const outMint = currencyMint(o.currency);
  for (const h of holdings) {
    const slice = (BigInt(h.vault_raw) * sharesRaw) / supply;
    if (slice === 0n) continue;
    await query(`UPDATE basket_holdings SET vault_raw = vault_raw - $3::bigint WHERE basket_id = $1 AND symbol = $2`, [o.basket_id, h.symbol, String(slice)]);
    if (o.side === "redeem") {
      await queuePayout(o, payoutMint(h.mint), slice, h.decimals, "redeem");
      outs.push({ symbol: h.symbol, raw: String(slice), sig: null });
    } else if (h.mint === outMint) {
      proceeds += slice;
    } else {
      try {
        must(checkFresh(limits(), h.price_at ? new Date(h.price_at) : null));
        const q = await chain.quote(h.mint, outMint, slice, config.MAX_SLIPPAGE_BPS);
        const swap = await chain.swapTransaction(q, vaultAddr);
        const sent = await spend(SWAP_TX, `sell ${o.id} ${h.symbol}`, () => chain.sendVersioned(vault, swap), owed);
        const got = await chain.receivedIn(sent.sig, vaultAddr, payoutMint(outMint));
        proceeds += got && got > 0n ? got : BigInt(q.otherAmountThreshold);
        outs.push({ symbol: h.symbol, raw: String(slice), sig: sent.sig });
      } catch (err) {
        // Can't swap it right now — pay the token itself out, as a redeem would.
        log.warn({ order: o.id, symbol: h.symbol, err: (err as Error).message }, "sell leg paid in kind");
        await queuePayout(o, payoutMint(h.mint), slice, h.decimals, "in_kind");
        outs.push({ symbol: h.symbol, raw: String(slice), sig: null, inKind: true });
      }
    }
  }

  let feeRaw = 0n;
  if (o.side === "sell" && proceeds > 0n) {
    feeRaw = platformFee(proceeds, config.PLATFORM_FEE_BPS);
    await bookFee(o.id, o.currency, feeRaw);
    await queuePayout(o, o.currency === "SOL" ? "SOL" : USDC_MINT, proceeds - feeRaw, currencyDecimals(o.currency), "proceeds");
  }
  return { settlesTo: "filled", outs, proceedsRaw: String(proceeds), feeRaw: String(feeRaw) };
}

/**
 * Orders run one at a time, whoever asks: the caller's wait can end long before a
 * slow order does, and two at once could open two share mints for one basket or
 * work out a redeem from half-booked numbers.
 */
const orderTurn = oneAtATime();

const execute = (orderId: string) => orderTurn(() => executeNow(orderId));

async function executeNow(orderId: string): Promise<Record<string, unknown>> {
  // Take the order atomically: only one executor ever moves it past `paid`.
  const taken = await one<{ id: string }>(
    `UPDATE orders SET status = 'executing', updated_at = now() WHERE id = $1 AND status = 'paid' RETURNING id`,
    [orderId],
  );
  if (!taken) throw new Error("order is not ready to execute");
  const o = (await loadOrder(orderId))!;
  try {
    const { settlesTo, ...result } = o.side === "buy" ? await executeBuy(o) : await executeExit(o);
    await query(`UPDATE orders SET status = 'settling', settles_to = $2, result = $3, updated_at = now() WHERE id = $1`, [o.id, settlesTo, JSON.stringify(result)]);
    await payPending(o.id).catch((err: Error) => log.warn({ order: o.id, err: err.message }, "first payout pass failed; the worker will retry"));
    return result;
  } catch (err) {
    // Something broke mid-order, in a way the flows above didn't catch. It is
    // never retried blind: it's parked for a look at the vault and the log.
    log.error({ order: o.id, err: (err as Error).message }, "order stopped mid-execution");
    await query(`UPDATE orders SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [o.id, (err as Error).message]);
    throw err;
  }
}

/* ------------------------------------------------------------------ payouts */

interface PayoutRow {
  id: string;
  order_id: string;
  wallet: string;
  mint: string;
  raw: string;
  decimals: number;
  reason: string;
  sig: string | null;
  attempts: number;
  age_ms: number;
}

const finishPayout = (id: string, sig: string | null) =>
  query(`UPDATE payouts SET status = 'sent', sig = COALESCE($2, sig), error = NULL, updated_at = now() WHERE id = $1`, [id, sig]);

async function payOne(p: PayoutRow): Promise<void> {
  // A previous attempt may have landed: ask the chain before sending again.
  if (p.sig) {
    const state = await chain.signatureState(p.sig);
    if (state === "confirmed") return void (await finishPayout(p.id, p.sig));
    if (state === "unknown" && p.age_ms < BLOCKHASH_LIFE_MS) {
      await query(`UPDATE payouts SET status = 'pending', next_try_at = now() + interval '1 minute' WHERE id = $1`, [p.id]);
      return;
    }
  }
  const vault = await openVault();
  const raw = BigInt(p.raw);
  const remember = async (sig: string) => {
    await query(`UPDATE payouts SET sig = $2, attempted_at = now() WHERE id = $1`, [p.id, sig]);
  };
  try {
    const sent = await spend(
      PLAIN_TX,
      `payout ${p.reason} ${p.order_id}`,
      () =>
        p.reason === "shares"
          ? chain.mintShares(vault, p.mint, p.wallet, raw, remember)
          : chain.transfer(vault, vault, p.mint, p.wallet, raw, p.decimals, remember),
      { orderId: p.order_id, owed: true },
    );
    await finishPayout(p.id, sent.sig);
  } catch (err) {
    const attempts = p.attempts + 1;
    const giveUp = attempts >= MAX_PAYOUT_ATTEMPTS;
    log.warn({ payout: p.id, order: p.order_id, attempts, err: (err as Error).message }, "payout attempt failed");
    await query(
      `UPDATE payouts SET status = $2, attempts = $3, error = $4, updated_at = now(),
              next_try_at = now() + make_interval(secs => $5) WHERE id = $1`,
      [p.id, giveUp ? "failed" : "pending", attempts, (err as Error).message, Math.min(1800, 30 * 2 ** attempts)],
    );
  }
}

/** Sends what's due — every payout is claimed first, so two passes can't send the same one. */
async function payPending(orderId?: string, retryFailed = false): Promise<{ sent: number; left: number }> {
  // A claim a crash left behind goes back in the queue; its stored signature protects it.
  await query(`UPDATE payouts SET status = 'pending' WHERE status = 'sending' AND updated_at < now() - interval '3 minutes'`);
  if (retryFailed) await query(`UPDATE payouts SET status = 'pending', attempts = 0, next_try_at = now() WHERE status = 'failed'`);
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM payouts WHERE status = 'pending' AND (next_try_at <= now() ${orderId ? "OR order_id = $1" : ""}) ORDER BY id LIMIT 20`,
    orderId ? [orderId] : [],
  );
  for (const { id } of rows) {
    const p = await one<PayoutRow>(
      `UPDATE payouts SET status = 'sending', updated_at = now() WHERE id = $1 AND status = 'pending'
       RETURNING id::text AS id, order_id, wallet, mint, raw::text AS raw, decimals, reason, sig, attempts,
                 (EXTRACT(EPOCH FROM now() - COALESCE(attempted_at, now())) * 1000)::float8 AS age_ms`,
      [id],
    );
    if (p) await payOne(p);
  }
  await query(
    `UPDATE orders o SET status = COALESCE(o.settles_to, 'filled'), updated_at = now()
      WHERE o.status = 'settling' AND NOT EXISTS (SELECT 1 FROM payouts p WHERE p.order_id = o.id AND p.status <> 'sent')`,
  );
  const left = await one<{ n: number }>(`SELECT count(*)::int AS n FROM payouts WHERE status <> 'sent'`);
  return { sent: rows.length, left: left?.n ?? 0 };
}

/* ------------------------------------------------- the commission: withdraw or burn */

/** Claims the accrued commission of one currency, so nothing else can spend it meanwhile. */
async function claimFees(currency: "USDC" | "SOL"): Promise<{ marker: string; total: bigint }> {
  const marker = `claim:${randomId(8)}`;
  const { rows } = await query<{ raw: string }>(`UPDATE fee_ledger SET taken_sig = $2 WHERE currency = $1 AND taken_sig IS NULL RETURNING raw::text AS raw`, [currency, marker]);
  return { marker, total: rows.reduce((s, r) => s + BigInt(r.raw), 0n) };
}
const closeClaim = (marker: string, sig: string) => query(`UPDATE fee_ledger SET taken_sig = $2 WHERE taken_sig = $1`, [marker, sig]);
const dropClaim = (marker: string) => query(`UPDATE fee_ledger SET taken_sig = NULL WHERE taken_sig = $1`, [marker]);

/** If a send failed but may yet land, the claim stays on it: better not to spend the fees twice. */
async function settleClaim(marker: string, lastSig: string | null): Promise<void> {
  const state = lastSig ? await chain.signatureState(lastSig).catch(() => "unknown" as const) : "failed";
  if (state === "failed") await dropClaim(marker);
  else log.warn({ marker, lastSig }, "commission claim left open: its transaction may have landed");
}

async function withdrawFees(currency: "USDC" | "SOL"): Promise<{ sig: string; raw: string; to: string }> {
  const to = config.TREASURY_WALLET;
  if (!to) throw new Error("Set TREASURY_WALLET on the server first.");
  const { marker, total } = await claimFees(currency);
  if (total === 0n) throw new Error(`No ${currency} commission to withdraw yet.`);
  const vault = await openVault();
  let last: string | null = null;
  try {
    const sent = await spend(PLAIN_TX + ATA_RENT, `withdraw ${currency}`, () =>
      chain.transfer(vault, vault, currency === "SOL" ? "SOL" : USDC_MINT, to, total, currencyDecimals(currency), (sig) => {
        last = sig;
      }),
    );
    await closeClaim(marker, sent.sig);
    log.info({ currency, raw: String(total), to, sig: sent.sig }, "commission withdrawn");
    return { sig: sent.sig, raw: String(total), to };
  } catch (err) {
    await settleClaim(marker, last);
    throw err;
  }
}

/** Spends the accrued commission on $ASTRA and burns everything of it the vault holds. */
async function buyback(currency: "USDC" | "SOL"): Promise<{ swapSig: string; burnSig: string; burnedRaw: string }> {
  const { ca } = await siteLinks();
  if (!ca) throw new Error("Set the contract address first.");
  const { marker, total } = await claimFees(currency);
  if (total === 0n) throw new Error(`No ${currency} commission to spend yet.`);
  const vault = await openVault();
  const vaultAddr = vault.publicKey.toBase58();
  let swapSig: string;
  let last: string | null = null;
  try {
    const q = await chain.quote(currencyMint(currency), ca, total, config.MAX_SLIPPAGE_BPS);
    const swap = await chain.swapTransaction(q, vaultAddr);
    const sent = await spend(SWAP_TX + ATA_RENT, "buyback", () =>
      chain.sendVersioned(vault, swap, (sig) => {
        last = sig;
      }),
    );
    swapSig = sent.sig;
    await closeClaim(marker, swapSig);
  } catch (err) {
    await settleClaim(marker, last);
    throw err;
  }
  // Whatever the vault holds of it, unless a basket owns it, including anything a failed burn left.
  const held = await one<{ s: string }>(
    `SELECT COALESCE(sum(h.vault_raw), 0)::text AS s FROM basket_holdings h JOIN assets a ON a.symbol = h.symbol WHERE a.mint = $1`,
    [ca],
  );
  const amount = (await chain.tokenBalance(vaultAddr, ca)) - BigInt(held?.s ?? 0);
  if (amount <= 0n) throw new Error("The swap landed but nothing arrived to burn yet — run it again in a minute.");
  const burn = await spend(PLAIN_TX, "burn $ASTRA", () => chain.burnTokens(vault, ca, amount));
  await query(`INSERT INTO burns (mint, raw, decimals, swap_sig, burn_sig) VALUES ($1, $2::bigint, $3, $4, $5)`, [ca, String(amount), await chain.mintDecimals(ca), swapSig, burn.sig]);
  log.info({ burned: String(amount), swapSig, burnSig: burn.sig }, "buyback & burn");
  return { swapSig, burnSig: burn.sig, burnedRaw: String(amount) };
}

/* -------------------------------------------------------------------- export */

async function exportKey(userId: string): Promise<string> {
  const u = await one<SealedRow & { custodial: boolean }>(`SELECT wallet, sealed_nonce, sealed_key, custodial FROM users WHERE id = $1`, [userId]);
  if (!u?.custodial) throw new Error("not a custodial wallet");
  return exportSecret(openCustodial(u));
}

/* --------------------------------------------------------------------- serve */

/** The operations, callable directly by the tests. */
export const signerOps = { deployBasket, payCustodial, execute, payPending, withdrawFees, buyback };

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
  app.post("/deploy", wrap<{ basketId: string }>((b) => orderTurn(() => deployBasket(b.basketId))));
  app.post("/pay", wrap<{ orderId: string }>((b) => payCustodial(b.orderId)));
  app.post("/execute", wrap<{ orderId: string }>((b) => execute(b.orderId)));
  app.post("/payouts", wrap<{ retryFailed?: boolean }>((b) => payPending(undefined, Boolean(b?.retryFailed))));
  app.post("/withdraw", wrap<{ currency: "USDC" | "SOL" }>((b) => withdrawFees(b.currency)));
  app.post("/buyback", wrap<{ currency: "USDC" | "SOL" }>((b) => buyback(b.currency)));
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
