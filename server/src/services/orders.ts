import type { ParsedTransactionWithMeta } from "@solana/web3.js";
import { received, signedBy } from "../chain/rpc.js";
import { chain } from "../chain/port.js";
import { PLAIN_TX } from "../chain/spl.js";
import { one, query } from "../db.js";
import { log } from "../logger.js";
import type { Verdict } from "../policy/engine.js";

const OK: Verdict = { ok: true };
const no = (code: string, reason: string): Verdict => ({ ok: false, code, reason });

/** Whether a transaction really paid this order: right sender, full amount, full network fee. */
export function checkDeposit(
  tx: ParsedTransactionWithMeta,
  want: { wallet: string; vault: string; mint: string; amountRaw: bigint; networkLamports: bigint },
): Verdict {
  if (!signedBy(tx, want.wallet)) return no("sender", "That transaction wasn't sent from your wallet.");
  const sol = received(tx, want.vault, "SOL");
  if (want.mint === "SOL") {
    return sol >= want.amountRaw + want.networkLamports ? OK : no("short", "That transaction didn't pay the full amount to the vault.");
  }
  if (received(tx, want.vault, want.mint) < want.amountRaw) return no("short", "That transaction didn't pay the full amount to the vault.");
  return sol >= want.networkLamports ? OK : no("short", "That transaction didn't pay the network fee to the vault.");
}

/**
 * The order counts as paid exactly once. What the buyer prepaid for the network
 * goes in the ledger as a credit, so the platform's spend only ever shows what
 * came out of its own pocket.
 */
export async function markPaid(orderId: string, sig: string, networkLamports: bigint): Promise<boolean> {
  const ok = await one(
    `UPDATE orders SET deposit_sig = $2, status = 'paid', updated_at = now() WHERE id = $1 AND status = 'awaiting_deposit' RETURNING id`,
    [orderId, sig],
  ).catch(() => null);
  if (!ok) return false;
  if (networkLamports > 0n) {
    await query(`INSERT INTO spend_ledger (lamports, reason, sig, order_id) VALUES ($1::bigint, 'prepaid', $2, $3)`, [String(-networkLamports), sig, orderId]);
  }
  return true;
}

/** Whether a wallet can pay an order, in words, before anything is signed. An RPC hiccup doesn't block it. */
export async function checkWalletFunds(
  wallet: string,
  mint: string | "SOL",
  amountRaw: bigint,
  lamports: number,
  label: string,
): Promise<Verdict> {
  try {
    const sol = BigInt(await chain.balanceOf(wallet));
    const fees = BigInt(lamports + PLAIN_TX);
    const solNeed = (mint === "SOL" ? amountRaw : 0n) + fees;
    if (sol < solNeed) {
      return no("funds", `Your wallet needs ${(Number(solNeed) / 1e9).toFixed(4)} SOL for this order and its network fees, and has ${(Number(sol) / 1e9).toFixed(4)}. Top up ${wallet}.`);
    }
    if (mint !== "SOL" && (await chain.tokenBalance(wallet, mint)) < amountRaw) {
      return no("funds", `Not enough ${label} in your wallet for this order. Top up ${wallet}.`);
    }
  } catch (err) {
    log.warn({ err: String(err) }, "couldn't read a wallet's balance");
  }
  return OK;
}
