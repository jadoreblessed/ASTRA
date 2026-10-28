import { Connection, type Commitment, type ParsedTransactionWithMeta, PublicKey } from "@solana/web3.js";
import { config } from "../config.js";

export const COMMITMENT: Commitment = "confirmed";

let conn: Connection | null = null;
export const rpc = () => (conn ??= new Connection(config.SOLANA_RPC_URL, COMMITMENT));

export const isAddress = (s: string): boolean => {
  try {
    return PublicKey.isOnCurve(new PublicKey(s).toBytes()) || s.length >= 32;
  } catch {
    return false;
  }
};

export const parsedTx = (sig: string): Promise<ParsedTransactionWithMeta | null> =>
  rpc().getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: COMMITMENT });

/**
 * What `owner` received in `tx`: lamports for SOL, base units for a token mint.
 * Negative when it sent. Reads the balance tables, not the instructions, so it
 * holds for any route the sender used.
 */
export function received(tx: ParsedTransactionWithMeta, owner: string, mint: string | "SOL"): bigint {
  const meta = tx.meta;
  if (!meta || meta.err) return 0n;
  if (mint === "SOL") {
    const i = tx.transaction.message.accountKeys.findIndex((k) => k.pubkey.toBase58() === owner);
    if (i < 0) return 0n;
    return BigInt(meta.postBalances[i]) - BigInt(meta.preBalances[i]);
  }
  const pick = (list: typeof meta.postTokenBalances) =>
    (list ?? [])
      .filter((b) => b.owner === owner && b.mint === mint)
      .reduce((s, b) => s + BigInt(b.uiTokenAmount.amount), 0n);
  return pick(meta.postTokenBalances) - pick(meta.preTokenBalances);
}

/** True when `wallet` signed `tx`. */
export const signedBy = (tx: ParsedTransactionWithMeta, wallet: string): boolean =>
  tx.transaction.message.accountKeys.some((k) => k.signer && k.pubkey.toBase58() === wallet);
