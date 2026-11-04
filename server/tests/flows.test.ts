import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

/**
 * The order flows end to end against a fake chain: real database (in memory),
 * real signer code, every path money can take. No SOL, no network.
 */

process.env.NODE_ENV = "test";
process.env.PGLITE_DIR = "memory://";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
process.env.LOG_LEVEL = "silent";
process.env.TRADING_ENABLED = "true";
process.env.MASTER_KEY = randomBytes(32).toString("base64");
process.env.MAX_TOTAL_SPEND_LAMPORTS = "50000000";
process.env.MAX_ORDER_USD = "100";
process.env.PLATFORM_FEE_BPS = "50";
process.env.TREASURY_WALLET = "Treasury1111111111111111111111111111111111111";

const { migrate } = await import("../src/util/migrate.ts");
const { closeDb, one, query } = await import("../src/db.ts");
const { chain } = await import("../src/chain/port.ts");
const { TxFailed } = await import("../src/chain/spl.ts");
const { SOL_MINT, USDC_MINT } = await import("../src/catalog.ts");
const { signerOps } = await import("../src/signer/service.ts");
const { spentLamports } = await import("../src/policy/limits.ts");
const { costsFor } = await import("../src/services/costs.ts");
const { checkDeposit, markPaid } = await import("../src/services/orders.ts");
const { saveSiteLinks } = await import("../src/services/site-links.ts");

const WALLET = "User11111111111111111111111111111111111111111";
const MINT_A = "MintA111111111111111111111111111111111111111";
const MINT_B = "MintB111111111111111111111111111111111111111";
const CA = "Astra11111111111111111111111111111111111111111";
const MINT_RENT = 1_461_600;
const ATA = 2_039_280;

/* ------------------------------------------------------------------ the fake */

interface Sendout {
  kind: string;
  mint?: string;
  to?: string;
  raw: bigint;
  sig: string;
}

const state = {
  sent: [] as Sendout[],
  sigStates: new Map<string, "confirmed" | "failed" | "unknown">(),
  received: new Map<string, bigint>(),
  noRoute: new Set<string>(),
  openAccounts: new Set<string>(),
  burnFails: false,
  mintFailsTimes: 0,
  transferMode: "ok" as "ok" | "fails" | "landsButTimesOut" | "lost",
  vaultLamports: 50_000_000,
  n: 0,
};

const sigOf = () => `sig${++state.n}`;
const account = (mint: string, owner: string) => `${mint}|${owner}`;

Object.assign(chain, {
  quote: async (inMint: string, outMint: string, raw: bigint) => {
    if (state.noRoute.has(outMint)) throw new Error("no route");
    return { inputMint: inMint, outputMint: outMint, inAmount: String(raw), outAmount: String(raw * 2n), otherAmountThreshold: String(raw * 2n - raw / 50n), slippageBps: 100, priceImpactPct: "0", routePlan: [] };
  },
  swapTransaction: async (q: { outputMint: string; outAmount: string }) => ({ tx: JSON.stringify(q), lastValidBlockHeight: 1 }),
  sendVersioned: async (_v: unknown, swap: { tx: string }) => {
    const q = JSON.parse(swap.tx) as { outputMint: string; outAmount: string };
    const sig = sigOf();
    state.received.set(sig, BigInt(q.outAmount));
    state.sent.push({ kind: "swap", mint: q.outputMint, raw: BigInt(q.outAmount), sig });
    // the first swap into a token opens the vault's account for it
    const key = `vault:${q.outputMint}`;
    const opens = q.outputMint !== SOL_MINT && !state.openAccounts.has(key);
    state.openAccounts.add(key);
    return { sig, costLamports: 25_000 + (opens ? ATA : 0) };
  },
  createShareMint: async () => {
    const sig = sigOf();
    state.sent.push({ kind: "createMint", raw: 0n, sig });
    return { sig, costLamports: MINT_RENT + 10_000 };
  },
  mintShares: async (_v: unknown, mint: string, to: string, raw: bigint, onSigned?: (s: string) => Promise<void>) => {
    const sig = sigOf();
    await onSigned?.(sig);
    if (state.mintFailsTimes > 0) {
      state.mintFailsTimes--;
      state.sigStates.set(sig, "failed");
      throw new Error("mint failed");
    }
    state.sigStates.set(sig, "confirmed");
    state.sent.push({ kind: "mint", mint, to, raw, sig });
    // only the buyer's first share of this basket opens their account
    const opens = !state.openAccounts.has(account(mint, to));
    state.openAccounts.add(account(mint, to));
    return { sig, costLamports: 10_000 + (opens ? ATA : 0) };
  },
  burnShares: async (_v: unknown, mint: string, raw: bigint) => {
    if (state.burnFails) throw new TxFailed("burn failed");
    const sig = sigOf();
    state.sent.push({ kind: "burn", mint, raw, sig });
    return { sig, costLamports: 10_000 };
  },
  burnTokens: async (_v: unknown, mint: string, raw: bigint) => {
    const sig = sigOf();
    state.sent.push({ kind: "burnTokens", mint, raw, sig });
    return { sig, costLamports: 10_000 };
  },
  transfer: async (_p: unknown, _f: unknown, mint: string, to: string, raw: bigint, _d: number, onSigned?: (s: string) => Promise<void> | void) => {
    const sig = sigOf();
    await onSigned?.(sig);
    if (state.transferMode === "fails") {
      state.sigStates.set(sig, "failed");
      throw new Error("no SOL for fees");
    }
    if (state.transferMode === "lost") {
      state.sigStates.set(sig, "unknown");
      throw new Error("didn't land in time");
    }
    state.sent.push({ kind: "transfer", mint, to, raw, sig });
    if (state.transferMode === "landsButTimesOut") {
      state.sigStates.set(sig, "confirmed");
      throw new Error("didn't land in time");
    }
    state.sigStates.set(sig, "confirmed");
    return { sig, costLamports: 10_000 };
  },
  payIn: async () => ({ sig: sigOf(), costLamports: 0 }),
  tokenBalance: async (owner: string, mint: string) => (mint === CA ? 5_000n : 1_000_000_000_000n),
  mintRent: async () => MINT_RENT,
  mintDecimals: async () => 6,
  signatureState: async (sig: string) => state.sigStates.get(sig) ?? "unknown",
  accountsExist: async (list: { mint: string; owner: string }[]) => list.map((l) => state.openAccounts.has(l.owner === WALLET ? account(l.mint, l.owner) : `vault:${l.mint}`)),
  ataRent: async () => ATA,
  classicRent: async () => ATA,
  rentFloor: async () => 890_880,
  balanceOf: async () => state.vaultLamports,
  receivedIn: async (sig: string) => state.received.get(sig) ?? null,
});

/* ------------------------------------------------------------------ fixtures */

let baskets = 0;

async function basket(opts: { curated?: boolean; mintA?: string; mintB?: string } = {}): Promise<string> {
  const id = `b${++baskets}`;
  await query(`INSERT INTO baskets (id, code, name, curated) VALUES ($1, $2, $1, $3)`, [id, id.toUpperCase(), opts.curated ?? true]);
  const a = opts.mintA ? `A${baskets}` : "AAA";
  const b = opts.mintB ? `B${baskets}` : "BBB";
  if (opts.mintA) await asset(a, opts.mintA, 6, 10);
  if (opts.mintB) await asset(b, opts.mintB, 6, 100);
  // $100 a share: 60 in AAA at $10, 40 in BBB at $100
  await query(`INSERT INTO basket_holdings (basket_id, symbol, weight_bps, units) VALUES ($1, $2, 6000, 6), ($1, $3, 4000, 0.4)`, [id, a, b]);
  return id;
}

const asset = (symbol: string, mint: string, decimals: number, price: number) =>
  query(
    `INSERT INTO assets (symbol, name, kind, mint, decimals, listed, usd_price, price_at) VALUES ($1, $1, 'crypto', $2, $3, true, $4, now())
     ON CONFLICT (symbol) DO UPDATE SET usd_price = EXCLUDED.usd_price, price_at = now()`,
    [symbol, mint, decimals, price],
  );

async function order(basketId: string, side: "buy" | "sell" | "redeem", amountRaw: bigint, opts: { currency?: "USDC" | "SOL"; network?: number; feeRaw?: bigint; setupPaidBy?: string } = {}): Promise<string> {
  const id = `o${++state.n}`;
  const currency = opts.currency ?? "USDC";
  const dec = side === "buy" && currency === "SOL" ? 9 : 6;
  const fee = opts.feeRaw ?? (side === "buy" ? (amountRaw * 50n) / 10_000n : 0n);
  await query(
    `INSERT INTO orders (id, user_id, basket_id, side, currency, amount, amount_raw, network_fee_lamports, platform_fee_raw, quote)
     VALUES ($1, 'u1', $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, basketId, side, currency, Number(amountRaw) / 10 ** dec, String(amountRaw), opts.network ?? 0, String(fee), JSON.stringify({ setupPaidBy: opts.setupPaidBy ?? "none" })],
  );
  assert.equal(await markPaid(id, `dep${id}`, BigInt(opts.network ?? 0)), true);
  return id;
}

const status = async (id: string) => (await one<{ status: string }>(`SELECT status FROM orders WHERE id = $1`, [id]))!.status;
const payouts = async (id: string) =>
  (await query<{ reason: string; mint: string; raw: string; status: string }>(`SELECT reason, mint, raw::text AS raw, status FROM payouts WHERE order_id = $1 ORDER BY id`, [id])).rows;
const fees = async (currency = "USDC") => BigInt((await one<{ s: string }>(`SELECT COALESCE(sum(raw), 0)::text AS s FROM fee_ledger WHERE currency = $1 AND taken_sig IS NULL`, [currency]))!.s);
const sends = (kind: string) => state.sent.filter((s) => s.kind === kind);
const shareMintOf = async (b: string) => (await one<{ share_mint: string }>(`SELECT share_mint FROM baskets WHERE id = $1`, [b]))!.share_mint;

before(async () => {
  await migrate();
  await query(`INSERT INTO users (id, wallet) VALUES ('u1', $1)`, [WALLET]);
  await asset("AAA", MINT_A, 6, 10);
  await asset("BBB", MINT_B, 6, 100);
  await asset("SOL", SOL_MINT, 9, 100);
});

after(async () => {
  await closeDb();
});

beforeEach(async () => {
  Object.assign(state, { sent: [], burnFails: false, mintFailsTimes: 0, transferMode: "ok", vaultLamports: 50_000_000 });
  state.noRoute.clear();
  state.openAccounts.clear();
  state.sigStates.clear();
  for (const t of ["payouts", "fee_ledger", "burns", "spend_ledger", "holdings_by_user", "orders", "basket_holdings", "baskets"]) await query(`DELETE FROM ${t}`);
  await query(`DELETE FROM kv WHERE key IN ('paused', 'site')`);
  await query(`UPDATE assets SET price_at = now()`);
});

/* ------------------------------------------------------------------ buying */

test("a buy takes 0.5%, swaps the rest by weight, mints the shares", async () => {
  const b = await basket();
  const o = await order(b, "buy", 10_000_000n, { network: 200_000 });
  await signerOps.execute(o);

  assert.equal(await status(o), "filled");
  assert.equal(await fees(), 50_000n); // 0.5% of $10
  const swaps = sends("swap");
  assert.equal(swaps.length, 2);
  // the rest, split 60/40 — the fake swap pays out 2x what goes in
  assert.equal(swaps.reduce((s, x) => s + x.raw, 0n), 9_950_000n * 2n);
  const minted = sends("mint");
  assert.equal(minted.length, 1);
  assert.equal(minted[0].to, WALLET);
  const row = await one<{ shares_raw: string; held: string }>(
    `SELECT b.shares_raw::text AS shares_raw, (SELECT sum(vault_raw)::text FROM basket_holdings WHERE basket_id = b.id) AS held FROM baskets b WHERE b.id = $1`,
    [b],
  );
  assert.equal(BigInt(row!.shares_raw), minted[0].raw);
  assert.equal(BigInt(row!.held), 9_950_000n * 2n);
});

test("a leg with no route: that part comes back, commission only on what filled", async () => {
  const b = await basket();
  state.noRoute.add(MINT_B);
  const o = await order(b, "buy", 10_000_000n);
  await signerOps.execute(o);

  assert.equal(await status(o), "filled");
  const filled = (9_950_000n * 6000n) / 10_000n; // the AAA leg
  const fee = (50_000n * filled) / 9_950_000n;
  assert.equal(await fees(), fee);
  const refund = (await payouts(o)).find((p) => p.reason === "refund")!;
  assert.equal(refund.status, "sent");
  assert.equal(BigInt(refund.raw), 10_000_000n - filled - fee);
  // nothing lost: filled + fee + refund = what was paid
  assert.equal(filled + fee + BigInt(refund.raw), 10_000_000n);
});

test("nothing fills: everything back, the commission too, and the unused network fee", async () => {
  const b = await basket();
  state.noRoute.add(MINT_A);
  state.noRoute.add(MINT_B);
  const o = await order(b, "buy", 10_000_000n, { network: 2_000_000 });
  await signerOps.execute(o);

  assert.equal(await status(o), "refunded");
  assert.equal(await fees(), 0n);
  const p = await payouts(o);
  assert.equal(BigInt(p.find((x) => x.reason === "refund")!.raw), 10_000_000n);
  assert.ok(BigInt(p.find((x) => x.reason === "change")!.raw) > 0n);
  assert.equal(sends("mint").length, 0);
});

test("stale prices: no swap at all, full refund", async () => {
  const b = await basket();
  await query(`UPDATE assets SET price_at = now() - interval '10 minutes' WHERE symbol = 'AAA'`);
  const o = await order(b, "buy", 10_000_000n);
  await signerOps.execute(o);
  assert.equal(await status(o), "refunded");
  assert.equal(sends("swap").length, 0);
});

test("paused mid-flight: a paid order goes straight back", async () => {
  const b = await basket();
  const o = await order(b, "buy", 10_000_000n);
  await query(`INSERT INTO kv (key, value) VALUES ('paused', '1')`);
  await signerOps.execute(o);
  assert.equal(await status(o), "refunded");
  assert.equal(sends("swap").length, 0);
});

test("the budget gone: buys are refused and the refund still goes out", async () => {
  const b = await basket();
  await query(`INSERT INTO spend_ledger (lamports, reason) VALUES (50000000, 'spent')`);
  const o = await order(b, "buy", 10_000_000n);
  await signerOps.execute(o);
  assert.equal(await status(o), "refunded");
  assert.equal(sends("transfer").length, 1);
  assert.equal(sends("transfer")[0].raw, 10_000_000n);
});

test("buying with SOL: a holding in SOL fills directly and costs count only fees", async () => {
  const b = `sol${++baskets}`;
  await query(`INSERT INTO baskets (id, code, name, curated) VALUES ($1, $2, $1, true)`, [b, b.toUpperCase()]);
  await query(`INSERT INTO basket_holdings (basket_id, symbol, weight_bps, units) VALUES ($1, 'SOL', 5000, 0.5), ($1, 'AAA', 5000, 5)`, [b]);
  const o = await order(b, "buy", 100_000_000n, { currency: "SOL" }); // 0.1 SOL
  await signerOps.execute(o);
  assert.equal(await status(o), "filled");
  assert.equal(sends("swap").length, 1); // only the AAA leg
  assert.equal(await fees("SOL"), 500_000n);
  // the 0.1 SOL itself is not "platform spend"
  assert.ok((await spentLamports()) < 10_000_000);
});

/* ------------------------------------------------------------------ the 0.05 SOL cap */

test("the platform never spends past 0.05 SOL, and buyers still get filled once it's used up", async () => {
  // Far more baskets, each with its own new tokens, than 0.05 SOL could open.
  let platformPaid = 0;
  let buyerPaid = 0;
  for (let i = 0; i < 12; i++) {
    const b = await basket({ curated: true, mintA: `MintA${i}`, mintB: `MintB${i}` });
    const costs = await costsFor({
      shareMint: null,
      curated: true,
      side: "buy",
      currency: "USDC",
      legs: [{ mint: `MintA${i}`, swap: true }, { mint: `MintB${i}`, swap: true }],
      wallet: WALLET,
    });
    if (costs.setupPaidBy === "platform") platformPaid++;
    else buyerPaid++;
    const o = await order(b, "buy", 10_000_000n, { network: costs.networkLamports, setupPaidBy: costs.setupPaidBy });
    await signerOps.execute(o);
    assert.equal(await status(o), "filled", `basket ${i} should fill`);
    assert.ok((await spentLamports()) <= 50_000_000, `over the cap at basket ${i}: ${await spentLamports()}`);
  }
  assert.ok(platformPaid > 0, "the budget should open some baskets");
  assert.ok(buyerPaid > 0, "past the budget the buyer pays");
});

test("every order pays its own way: 100 repeat buys cost the platform nothing", async () => {
  const b = await basket();
  const first = await costsFor({ shareMint: null, curated: true, side: "buy", currency: "USDC", legs: [{ mint: MINT_A, swap: true }, { mint: MINT_B, swap: true }], wallet: WALLET });
  await signerOps.execute(await order(b, "buy", 10_000_000n, { network: first.networkLamports, setupPaidBy: first.setupPaidBy }));
  const afterSetup = await spentLamports();
  for (let i = 0; i < 100; i++) {
    const c = await costsFor({ shareMint: await shareMintOf(b), curated: true, side: "buy", currency: "USDC", legs: [{ mint: MINT_A, swap: true }, { mint: MINT_B, swap: true }], wallet: WALLET });
    assert.equal(c.setupLamports, 0);
    await signerOps.execute(await order(b, "buy", 10_000_000n, { network: c.networkLamports }));
  }
  assert.ok((await spentLamports()) <= afterSetup, "repeat buys must not eat into the budget");
});

test("a user-made basket never draws on the platform's budget", async () => {
  const c = await costsFor({ shareMint: null, curated: false, side: "buy", currency: "USDC", legs: [{ mint: "New", swap: true }], wallet: WALLET });
  assert.equal(c.setupPaidBy, "buyer");
  assert.ok(c.networkLamports >= c.setupLamports);
});

/* ------------------------------------------------------------------ getting out */

async function holdPosition(): Promise<{ b: string; shares: bigint }> {
  const b = await basket();
  await signerOps.execute(await order(b, "buy", 10_000_000n));
  state.sent = [];
  return { b, shares: BigInt((await one<{ s: string }>(`SELECT shares_raw::text AS s FROM baskets WHERE id = $1`, [b]))!.s) };
}

test("redeem: burns the shares, pays the exact tokens pro rata, no commission", async () => {
  const { b, shares } = await holdPosition();
  const before = await fees();
  const o = await order(b, "redeem", shares / 2n);
  await signerOps.execute(o);

  assert.equal(await status(o), "filled");
  assert.equal(sends("burn")[0].raw, shares / 2n);
  assert.equal(sends("swap").length, 0);
  const out = sends("transfer");
  assert.equal(out.length, 2);
  assert.deepEqual(new Set(out.map((t) => t.mint)), new Set([MINT_A, MINT_B]));
  assert.equal(await fees(), before);
  const left = await one<{ s: string; held: string }>(`SELECT b.shares_raw::text AS s, (SELECT sum(vault_raw)::text FROM basket_holdings WHERE basket_id = b.id) AS held FROM baskets b WHERE b.id = $1`, [b]);
  assert.equal(BigInt(left!.s), shares - shares / 2n);
  assert.ok(BigInt(left!.held) > 0n);
});

test("a redeem pays out even when trading is paused and the budget is gone", async () => {
  const { b, shares } = await holdPosition();
  await query(`INSERT INTO kv (key, value) VALUES ('paused', '1')`);
  await query(`INSERT INTO spend_ledger (lamports, reason) VALUES (50000000, 'spent')`);
  const o = await order(b, "redeem", shares);
  await signerOps.execute(o);
  assert.equal(await status(o), "filled");
  assert.equal(sends("transfer").length, 2);
});

test("sell: swaps to USDC, takes 0.5%, pays the rest", async () => {
  const { b, shares } = await holdPosition();
  const before = await fees();
  const o = await order(b, "sell", shares);
  await signerOps.execute(o);
  assert.equal(await status(o), "filled");
  const swapped = sends("swap").reduce((s, x) => s + x.raw, 0n);
  const fee = (swapped * 50n) / 10_000n;
  assert.equal((await fees()) - before, fee);
  const paid = sends("transfer");
  assert.equal(paid.length, 1);
  assert.equal(paid[0].mint, USDC_MINT);
  assert.equal(paid[0].raw, swapped - fee);
});

test("sell, a leg that can't swap: that token itself is paid out", async () => {
  const { b, shares } = await holdPosition();
  state.noRoute.add(USDC_MINT);
  const o = await order(b, "sell", shares);
  await signerOps.execute(o);
  assert.equal(await status(o), "filled");
  const reasons = (await payouts(o)).map((p) => p.reason);
  assert.deepEqual(reasons, ["in_kind", "in_kind"]);
  assert.deepEqual(new Set(sends("transfer").map((t) => t.mint)), new Set([MINT_A, MINT_B]));
});

test("the burn fails: the shares go back and nothing else moves", async () => {
  const { b, shares } = await holdPosition();
  state.burnFails = true;
  const share = await shareMintOf(b);
  const o = await order(b, "redeem", shares);
  await signerOps.execute(o);
  assert.equal(await status(o), "refunded");
  const out = sends("transfer");
  assert.equal(out.length, 1);
  assert.equal(out[0].mint, share);
  assert.equal(out[0].raw, shares);
  assert.equal(BigInt((await one<{ s: string }>(`SELECT shares_raw::text AS s FROM baskets WHERE id = $1`, [b]))!.s), shares);
});

/* ------------------------------------------------------------------ the queue */

test("a payout that can't go out now stays queued and lands on a later pass", async () => {
  const b = await basket();
  state.noRoute.add(MINT_A);
  state.noRoute.add(MINT_B);
  state.transferMode = "fails";
  const o = await order(b, "buy", 10_000_000n);
  await signerOps.execute(o);
  assert.equal(await status(o), "settling");
  assert.equal((await payouts(o))[0].status, "pending");

  state.transferMode = "ok";
  await query(`UPDATE payouts SET next_try_at = now()`);
  await signerOps.payPending();
  assert.equal(await status(o), "refunded");
  assert.equal(sends("transfer").length, 1);
});

test("never pays twice: an attempt that landed but timed out isn't sent again", async () => {
  const b = await basket();
  state.noRoute.add(MINT_A);
  state.noRoute.add(MINT_B);
  state.transferMode = "landsButTimesOut";
  const o = await order(b, "buy", 10_000_000n);
  await signerOps.execute(o);
  assert.equal(sends("transfer").length, 1);
  assert.equal(await status(o), "settling");

  state.transferMode = "ok";
  await query(`UPDATE payouts SET next_try_at = now()`);
  await signerOps.payPending();
  assert.equal(sends("transfer").length, 1, "must not send again");
  assert.equal(await status(o), "refunded");
});

test("an attempt that may still land isn't resent until its blockhash is dead", async () => {
  const b = await basket();
  state.noRoute.add(MINT_A);
  state.noRoute.add(MINT_B);
  state.transferMode = "lost";
  const o = await order(b, "buy", 10_000_000n);
  await signerOps.execute(o);

  state.transferMode = "ok";
  await query(`UPDATE payouts SET next_try_at = now()`);
  await signerOps.payPending();
  assert.equal(sends("transfer").length, 0, "too soon: it could still land");

  await query(`UPDATE payouts SET next_try_at = now(), attempted_at = now() - interval '5 minutes'`);
  await signerOps.payPending();
  assert.equal(sends("transfer").length, 1);
  assert.equal(await status(o), "refunded");
});

test("two passes at once can't send the same payout", async () => {
  const b = await basket();
  state.noRoute.add(MINT_A);
  state.noRoute.add(MINT_B);
  state.transferMode = "fails";
  const o = await order(b, "buy", 10_000_000n);
  await signerOps.execute(o);
  state.transferMode = "ok";
  await query(`UPDATE payouts SET next_try_at = now()`);
  await Promise.all([signerOps.payPending(), signerOps.payPending(), signerOps.payPending()]);
  assert.equal(sends("transfer").length, 1);
});

test("a share mint that fails is retried by the queue; the shares aren't lost", async () => {
  const b = await basket();
  state.mintFailsTimes = 1;
  const o = await order(b, "buy", 10_000_000n);
  await signerOps.execute(o);
  assert.equal(await status(o), "settling");
  assert.equal(sends("mint").length, 0);

  await query(`UPDATE payouts SET next_try_at = now()`);
  await signerOps.payPending();
  assert.equal(sends("mint").length, 1);
  assert.equal(await status(o), "filled");
});

test("an order can't be executed twice", async () => {
  const b = await basket();
  const o = await order(b, "buy", 10_000_000n);
  await signerOps.execute(o);
  await assert.rejects(signerOps.execute(o));
  assert.equal(sends("mint").length, 1);
});

/* ------------------------------------------------------------------ at the same time */

test("two orders at once on a new basket open one share mint, and both get its shares", async () => {
  const b = await basket();
  const [o1, o2] = [await order(b, "buy", 10_000_000n), await order(b, "buy", 20_000_000n)];
  await Promise.all([signerOps.execute(o1), signerOps.execute(o2)]);
  assert.equal(sends("createMint").length, 1);
  const mint = await shareMintOf(b);
  assert.deepEqual(sends("mint").map((m) => m.mint), [mint, mint]);
  assert.equal(await status(o1), "filled");
  assert.equal(await status(o2), "filled");
});

test("two redeems at once each get their exact part", async () => {
  const { b, shares } = await holdPosition();
  const half = shares / 2n;
  const [o1, o2] = [await order(b, "redeem", half), await order(b, "redeem", half)];
  await Promise.all([signerOps.execute(o1), signerOps.execute(o2)]);
  const first = (await payouts(o1)).filter((p) => p.reason === "redeem").map((p) => p.raw);
  const second = (await payouts(o2)).filter((p) => p.reason === "redeem").map((p) => p.raw);
  assert.ok(first.length > 0);
  assert.deepEqual(first, second);
});

test("a cost still on its way counts against the budget", async () => {
  const b = await basket();
  await signerOps.execute(await order(b, "buy", 10_000_000n));

  // Room for one swap (35,000) alone, but not with a payout (15,000) in flight.
  await query(`DELETE FROM spend_ledger`);
  await query(`INSERT INTO spend_ledger (lamports, reason) VALUES ($1, 'used up')`, [50_000_000 - 40_000]);
  const slow = await order(b, "buy", 10_000_000n);
  await query(`INSERT INTO payouts (order_id, wallet, mint, raw, decimals, reason) VALUES ($1, $2, 'SOL', 1000, 9, 'refund')`, [slow, WALLET]);

  const realTransfer = chain.transfer;
  let letGo = () => {};
  const held = new Promise<void>((resolve) => (letGo = resolve));
  let started = () => {};
  const isSending = new Promise<void>((resolve) => (started = resolve));
  let holding = true;
  Object.assign(chain, {
    transfer: async () => {
      if (holding) {
        holding = false;
        started();
        await held;
      }
      return { sig: sigOf(), costLamports: 10_000 };
    },
  });
  try {
    const pass = signerOps.payPending();
    await isSending;
    const swapsBefore = sends("swap").length;
    const blocked = await order(b, "buy", 10_000_000n);
    await signerOps.execute(blocked);
    assert.equal(sends("swap").length, swapsBefore);
    assert.equal(await one<{ settles_to: string }>(`SELECT settles_to FROM orders WHERE id = $1`, [blocked]).then((r) => r!.settles_to), "refunded");
    letGo();
    await pass;
  } finally {
    letGo();
    Object.assign(chain, { transfer: realTransfer });
  }
});

/* ------------------------------------------------------------------ the deposit */

const fakeTx = (signer: string, vault: string, solIn: number, tokensIn: number, mint: string) =>
  ({
    transaction: { message: { accountKeys: [{ pubkey: { toBase58: () => signer }, signer: true }, { pubkey: { toBase58: () => vault }, signer: false }] } },
    meta: {
      err: null,
      preBalances: [1_000_000_000, 5_000_000],
      postBalances: [900_000_000, 5_000_000 + solIn],
      preTokenBalances: [],
      postTokenBalances: tokensIn ? [{ owner: vault, mint, uiTokenAmount: { amount: String(tokensIn) } }] : [],
    },
  }) as never;

test("a deposit must pay the order and the network fee, from the right wallet", () => {
  const want = { wallet: WALLET, vault: "Vault", mint: USDC_MINT, amountRaw: 1_000_000n, networkLamports: 300_000n };
  assert.equal(checkDeposit(fakeTx(WALLET, "Vault", 300_000, 1_000_000, USDC_MINT), want).ok, true);
  assert.equal(checkDeposit(fakeTx(WALLET, "Vault", 299_999, 1_000_000, USDC_MINT), want).ok, false, "short on the network fee");
  assert.equal(checkDeposit(fakeTx(WALLET, "Vault", 300_000, 999_999, USDC_MINT), want).ok, false, "short on the amount");
  assert.equal(checkDeposit(fakeTx("Someone", "Vault", 300_000, 1_000_000, USDC_MINT), want).ok, false, "someone else's payment");
  const sol = { ...want, mint: "SOL", amountRaw: 100_000_000n };
  assert.equal(checkDeposit(fakeTx(WALLET, "Vault", 100_300_000, 0, ""), sol).ok, true);
  assert.equal(checkDeposit(fakeTx(WALLET, "Vault", 100_299_999, 0, ""), sol).ok, false);
});

test("the same payment can't pay two orders", async () => {
  const b = await basket();
  const o1 = await order(b, "buy", 1_000_000n);
  const sig = (await one<{ deposit_sig: string }>(`SELECT deposit_sig FROM orders WHERE id = $1`, [o1]))!.deposit_sig;
  await query(
    `INSERT INTO orders (id, user_id, basket_id, side, currency, amount, amount_raw) VALUES ('dup', 'u1', $1, 'buy', 'USDC', 1, 1000000)`,
    [b],
  );
  assert.equal(await markPaid("dup", sig, 0n), false);
  assert.equal(await status("dup"), "awaiting_deposit");
});

/* ------------------------------------------------------------------ the commission */

test("the commission withdraws to the treasury once, and only what accrued", async () => {
  const b = await basket();
  await signerOps.execute(await order(b, "buy", 10_000_000n));
  const r = await signerOps.withdrawFees("USDC");
  assert.equal(r.raw, "50000");
  const t = sends("transfer").at(-1)!;
  assert.equal(t.to, process.env.TREASURY_WALLET);
  assert.equal(t.raw, 50_000n);
  assert.equal(await fees(), 0n);
  await assert.rejects(signerOps.withdrawFees("USDC"), /No USDC commission/);
});

test("a failed withdrawal leaves the commission accrued", async () => {
  const b = await basket();
  await signerOps.execute(await order(b, "buy", 10_000_000n));
  state.transferMode = "fails";
  await assert.rejects(signerOps.withdrawFees("USDC"));
  assert.equal(await fees(), 50_000n);
});

test("buyback spends the commission on the CA and burns it", async () => {
  const b = await basket();
  await signerOps.execute(await order(b, "buy", 10_000_000n));
  await assert.rejects(signerOps.buyback("USDC"), /contract address/);
  assert.equal(await fees(), 50_000n, "nothing claimed without a CA");

  await saveSiteLinks({ ca: CA, x: "", telegram: "" });
  const r = await signerOps.buyback("USDC");
  assert.equal(r.burnedRaw, "5000");
  assert.equal(sends("swap").at(-1)!.mint, CA);
  assert.equal(sends("burnTokens")[0].mint, CA);
  assert.equal(await fees(), 0n);
  assert.equal((await one<{ n: number }>(`SELECT count(*)::int AS n FROM burns`))!.n, 1);
});
