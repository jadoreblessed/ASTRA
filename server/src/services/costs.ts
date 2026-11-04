import { SOL_MINT, USDC_MINT } from "../catalog.js";
import { chain } from "../chain/port.js";
import { PLAIN_TX, SWAP_TX } from "../chain/spl.js";
import { vaultAddress } from "../chain/wallet.js";
import { one, query } from "../db.js";
import { log } from "../logger.js";
import { setupPaidByPlatform } from "../policy/engine.js";
import { limits, spentLamports } from "../policy/limits.js";

/**
 * What an order costs on the network, and who pays.
 *
 * The buyer pays for everything their order uses — transaction fees and their
 * own token accounts — as a SOL amount sent to the vault in the same transaction
 * as the order itself. So serving an order costs the platform nothing, however
 * many there are.
 *
 * The one thing that isn't any single buyer's is "shared setup": a basket's share
 * mint and the vault's token account for each asset, paid once and used by
 * everyone after. The platform's 0.05 SOL covers that for the curated baskets
 * while it lasts; past that, or for a user-made basket, the first buyer pays it.
 * The lifetime total from the platform's own pocket can't pass the cap.
 */

/** Below this the vault can't stay on chain and still send a transaction: orders aren't accepted. */
export const vaultMinLamports = async () => (await chain.rentFloor()) + 100_000;

/** Used only if the chain can't be asked: the buyer overpays a little rather than the order running short. */
const ATA_RENT_FALLBACK = 2_300_000;

export interface Costs {
  /** Sent to the vault with the order. */
  networkLamports: number;
  /** Rent the buyer's own transaction pays directly (the vault's first account of this token). */
  directLamports: number;
  /** One-off accounts this order would open for everyone. */
  setupLamports: number;
  setupPaidBy: "platform" | "buyer" | "none";
}

export interface CostLeg {
  mint: string;
  /** Whether this leg needs a swap (a direct fill doesn't). */
  swap: boolean;
}

/** The vault's SOL that isn't owed to anyone: not held for a basket, not commission, not a pending order. */
export async function vaultFreeLamports(): Promise<number> {
  const balance = await chain.balanceOf(await vaultAddress());
  const row = await one<{ held: string; fees: string; pending: string; owed: string }>(
    `SELECT
       (SELECT COALESCE(sum(h.vault_raw), 0)::text FROM basket_holdings h JOIN assets a ON a.symbol = h.symbol WHERE a.mint = $1) AS held,
       (SELECT COALESCE(sum(raw), 0)::text FROM fee_ledger WHERE currency = 'SOL' AND taken_sig IS NULL) AS fees,
       (SELECT COALESCE(sum(amount_raw), 0)::text FROM orders WHERE side = 'buy' AND currency = 'SOL' AND status IN ('paid', 'executing')) AS pending,
       (SELECT COALESCE(sum(raw), 0)::text FROM payouts WHERE mint = 'SOL' AND status IN ('pending', 'sending', 'failed')) AS owed`,
    [SOL_MINT],
  );
  return balance - Number(row?.held ?? 0) - Number(row?.fees ?? 0) - Number(row?.pending ?? 0) - Number(row?.owed ?? 0) - (await chain.rentFloor());
}

const existing = async (list: { mint: string; owner: string }[]): Promise<boolean[]> => {
  if (list.length === 0) return [];
  try {
    return await chain.accountsExist(list);
  } catch (err) {
    // Can't tell: assume they all need opening. The buyer overpays a little
    // rather than the order running short.
    log.warn({ err: String(err) }, "couldn't read token accounts");
    return list.map(() => false);
  }
};

const rentOf = async (mint: string): Promise<number> => {
  try {
    return await chain.ataRent(mint);
  } catch {
    return ATA_RENT_FALLBACK;
  }
};

export async function costsFor(args: {
  shareMint: string | null;
  curated: boolean;
  side: "buy" | "sell" | "redeem";
  currency: "USDC" | "SOL";
  legs: CostLeg[];
  /** The buyer, when known. Without one (a logged-out quote) their accounts count as new. */
  wallet: string | null;
}): Promise<Costs> {
  const { shareMint, curated, side, currency, legs, wallet } = args;
  const vault = await vaultAddress();
  const tokens = (mints: string[]) => mints.filter((m) => m !== SOL_MINT);

  if (side === "buy") {
    const swapped = legs.filter((l) => l.swap);
    const held = tokens(swapped.map((l) => l.mint));
    const openVault = await existing(held.map((mint) => ({ mint, owner: vault })));
    let setup = shareMint ? 0 : (await chain.mintRent()) + PLAIN_TX;
    for (let i = 0; i < held.length; i++) if (!openVault[i]) setup += await rentOf(held[i]);

    const classic = await chain.classicRent().catch(() => ATA_RENT_FALLBACK);
    let userShareRent = classic;
    if (shareMint && wallet) userShareRent = (await existing([{ mint: shareMint, owner: wallet }]))[0] ? 0 : classic;

    // swaps + the share mint + one spare, so a missed leg can be refunded
    const txs = swapped.length * SWAP_TX + PLAIN_TX + PLAIN_TX;
    let directLamports = 0;
    if (currency === "USDC") directLamports = (await existing([{ mint: USDC_MINT, owner: vault }]))[0] ? 0 : classic;

    const platform =
      setup > 0 && setupPaidByPlatform(limits(), await spentLamports(), await vaultFreeLamports().catch(() => 0), setup, curated);
    return {
      networkLamports: txs + userShareRent + (platform ? 0 : setup),
      directLamports,
      setupLamports: setup,
      setupPaidBy: setup === 0 ? "none" : platform ? "platform" : "buyer",
    };
  }

  // Sell or redeem. The vault's share account is opened by the first seller's
  // own transaction, if it doesn't exist yet.
  const classic = await chain.classicRent().catch(() => ATA_RENT_FALLBACK);
  const directLamports = shareMint && !(await existing([{ mint: shareMint, owner: vault }]))[0] ? classic : 0;
  if (side === "redeem") {
    const out = tokens(legs.map((l) => l.mint));
    const open = wallet ? await existing(out.map((mint) => ({ mint, owner: wallet }))) : out.map(() => false);
    let rent = 0;
    for (let i = 0; i < out.length; i++) if (!open[i]) rent += await rentOf(out[i]);
    return { networkLamports: PLAIN_TX + legs.length * PLAIN_TX + rent, directLamports, setupLamports: 0, setupPaidBy: "none" };
  }
  const swaps = legs.filter((l) => l.swap).length;
  let payoutRent = 0;
  if (currency === "USDC") payoutRent = wallet && (await existing([{ mint: USDC_MINT, owner: wallet }]))[0] ? 0 : classic;
  return { networkLamports: PLAIN_TX + swaps * SWAP_TX + PLAIN_TX + payoutRent, directLamports, setupLamports: 0, setupPaidBy: "none" };
}

/** Records a commission; it stays in the vault until withdrawn or spent on a buyback. */
export async function bookFee(orderId: string, currency: "USDC" | "SOL", raw: bigint): Promise<void> {
  if (raw > 0n) await query(`INSERT INTO fee_ledger (order_id, currency, raw) VALUES ($1, $2, $3::bigint)`, [orderId, currency, String(raw)]);
}
