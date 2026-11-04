import {
  ComputeBudgetProgram,
  type Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  ExtensionType,
  getAccountLen,
  getAccountTypeOfMintType,
  getAssociatedTokenAddressSync,
  getExtensionTypes,
  getMinimumBalanceForRentExemptMint,
  getMint,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import { rpc, COMMITMENT } from "./rpc.js";

/**
 * The few chain writes ASTRA makes — no custom program, so nothing to deploy:
 * a basket's share is a plain SPL mint whose authority is the vault. Each
 * helper returns the signature and what it cost the fee payer in lamports
 * (network fee + any account rent), read back from the confirmed transaction
 * rather than from balances, so SOL that merely moves is never counted as cost.
 *
 * `onSigned` runs before the transaction leaves, so a caller can store the
 * signature and, after a crash or a timeout, ask the chain whether it landed
 * instead of paying twice.
 */

export interface Sent {
  sig: string;
  costLamports: number;
}

export type OnSigned = (sig: string) => void | Promise<void>;

/** A transaction that reached the chain and failed: its fee is still gone. */
export class TxFailed extends Error {
  costLamports = 10_000;
}

/* What the buyer is charged up front, rounded up from the real numbers. */
export const PLAIN_TX = 15_000; // base fee + the priority below
export const SWAP_TX = 35_000; // base fee + Jupiter's capped tip + a little
export const ATA_RENT = 2_039_280; // a classic token account at the old rent: only a fallback, and a safe one
const CLASSIC_ACCOUNT_BYTES = 165;

const PRIORITY = [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 })];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends and re-sends until the transaction lands or its blockhash dies. Polls
 * rather than subscribing, and keeps rebroadcasting, which is what makes a
 * transaction actually land from a public RPC under load.
 */
async function land(raw: Uint8Array, sig: string, lastValid: number): Promise<void> {
  const c = rpc();
  await c.sendRawTransaction(raw, { maxRetries: 0, preflightCommitment: COMMITMENT });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await sleep(1_500);
    try {
      const { value } = await c.getSignatureStatuses([sig]);
      const st = value[0];
      if (st?.err) throw new TxFailed(`transaction failed: ${JSON.stringify(st.err)}`);
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return;
      if ((await c.getBlockHeight(COMMITMENT)) > lastValid) break;
      await c.sendRawTransaction(raw, { maxRetries: 0, skipPreflight: true }).catch(() => undefined);
    } catch (err) {
      if (err instanceof TxFailed) throw err;
      // an RPC hiccup while waiting isn't an answer about the transaction
    }
  }
  throw new Error(`transaction ${sig} didn't land in time`);
}

/** Fee + rent of accounts this transaction created, from the confirmed record. */
async function costOf(sig: string, extra = 0): Promise<number> {
  const c = rpc();
  for (let i = 0; i < 5; i++) {
    const tx = await c.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
    const meta = tx?.meta;
    if (meta) {
      const created = (meta.postTokenBalances ?? [])
        .filter((b) => meta.preBalances[b.accountIndex] === 0 && meta.postBalances[b.accountIndex] > 0)
        .reduce((s, b) => s + meta.postBalances[b.accountIndex], 0);
      return meta.fee + created + extra;
    }
    await sleep(800);
  }
  return PLAIN_TX + extra;
}

async function send(payer: Keypair, ixs: TransactionInstruction[], extra: Keypair[] = [], onSigned?: OnSigned, extraCost = 0): Promise<Sent> {
  const { blockhash, lastValidBlockHeight } = await rpc().getLatestBlockhash(COMMITMENT);
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(...PRIORITY, ...ixs);
  tx.sign(payer, ...extra);
  const sig = bs58.encode(tx.signature!);
  await onSigned?.(sig);
  await land(tx.serialize(), sig, lastValidBlockHeight);
  return { sig, costLamports: await costOf(sig, extraCost) };
}

/** Signs and sends a prepared versioned transaction (a Jupiter swap). */
export async function sendVersioned(payer: Keypair, swap: { tx: string; lastValidBlockHeight: number }, onSigned?: OnSigned): Promise<Sent> {
  const tx = VersionedTransaction.deserialize(Buffer.from(swap.tx, "base64"));
  tx.sign([payer]);
  const sig = bs58.encode(tx.signatures[0]);
  await onSigned?.(sig);
  await land(tx.serialize(), sig, swap.lastValidBlockHeight);
  return { sig, costLamports: await costOf(sig) };
}

/** Did this transaction land? `unknown` means not visible — it may yet, until its blockhash dies. */
export async function signatureState(sig: string): Promise<"confirmed" | "failed" | "unknown"> {
  const { value } = await rpc().getSignatureStatuses([sig], { searchTransactionHistory: true });
  const st = value[0];
  if (!st) return "unknown";
  if (st.err) return "failed";
  return st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized" ? "confirmed" : "unknown";
}

/** Rent for a new mint. */
export const mintRent = () => getMinimumBalanceForRentExemptMint(rpc());

export async function createShareMint(vault: Keypair, mint: Keypair, decimals: number): Promise<Sent> {
  const rent = await mintRent();
  return send(
    vault,
    [
      SystemProgram.createAccount({
        fromPubkey: vault.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports: rent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(mint.publicKey, decimals, vault.publicKey, null),
    ],
    [mint],
    undefined,
    rent,
  );
}

const ata = (mint: PublicKey, owner: PublicKey, program = TOKEN_PROGRAM_ID) =>
  getAssociatedTokenAddressSync(mint, owner, true, program);

/** Classic SPL or Token-2022 (xStocks are Token-2022) — read off the mint account. */
const programs = new Map<string, PublicKey>();
export async function programOf(mint: PublicKey): Promise<PublicKey> {
  const key = mint.toBase58();
  const hit = programs.get(key);
  if (hit) return hit;
  const info = await rpc().getAccountInfo(mint, COMMITMENT);
  if (!info) throw new Error(`mint ${key} not found`);
  const program = info.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  programs.set(key, program);
  return program;
}

export async function mintDecimals(mint: string): Promise<number> {
  const m = new PublicKey(mint);
  return (await getMint(rpc(), m, COMMITMENT, await programOf(m))).decimals;
}

/** The chain's own rent table, asked rather than assumed: the rate has changed before. */
const rentBySize = new Map<number, { at: number; lamports: number }>();
export async function rentFor(bytes: number): Promise<number> {
  const hit = rentBySize.get(bytes);
  if (hit && Date.now() - hit.at < 600_000) return hit.lamports;
  const lamports = await rpc().getMinimumBalanceForRentExemption(bytes, COMMITMENT);
  rentBySize.set(bytes, { at: Date.now(), lamports });
  return lamports;
}

/** What a wallet must keep to stay on chain at all. */
export const rentFloor = () => rentFor(0);
/** A classic token account (a share account, USDC…). */
export const classicRent = () => rentFor(CLASSIC_ACCOUNT_BYTES);

/**
 * The mint extensions that force one onto every token account of the mint; the
 * others (a confidential-transfer config, say) stay on the mint.
 */
const ON_EVERY_ACCOUNT = new Set([ExtensionType.TransferFeeConfig, ExtensionType.NonTransferable, ExtensionType.TransferHook, ExtensionType.PausableConfig]);

/** Rent for a new token account of this mint: a Token-2022 mint's extensions can make its accounts larger. */
const accountSizes = new Map<string, number>();
export async function ataRent(mint: string): Promise<number> {
  let size = accountSizes.get(mint);
  if (!size) {
    const m = new PublicKey(mint);
    const program = await programOf(m);
    size = CLASSIC_ACCOUNT_BYTES;
    if (program.equals(TOKEN_2022_PROGRAM_ID)) {
      const info = await getMint(rpc(), m, COMMITMENT, program);
      const forced = getExtensionTypes(info.tlvData).filter((e) => ON_EVERY_ACCOUNT.has(e)).map(getAccountTypeOfMintType);
      size = getAccountLen([...forced, ExtensionType.ImmutableOwner]);
    }
    accountSizes.set(mint, size);
  }
  return rentFor(size);
}

/** Which of these token accounts already exist. Positive answers are kept: they never go away. */
const known = new Set<string>();
export async function accountsExist(list: { mint: string; owner: string }[]): Promise<boolean[]> {
  const addrs = await Promise.all(
    list.map(async ({ mint, owner }) => {
      const m = new PublicKey(mint);
      return ata(m, new PublicKey(owner), await programOf(m));
    }),
  );
  const keys = addrs.map((a) => a.toBase58());
  const unknownAt = keys.flatMap((k, i) => (known.has(k) ? [] : [i]));
  if (unknownAt.length > 0) {
    // the RPC takes up to 100 per call
    for (let i = 0; i < unknownAt.length; i += 100) {
      const batch = unknownAt.slice(i, i + 100);
      const infos = await rpc().getMultipleAccountsInfo(batch.map((j) => addrs[j]), COMMITMENT);
      infos.forEach((info, n) => {
        if (info) known.add(keys[batch[n]]);
      });
    }
  }
  return keys.map((k) => known.has(k));
}

export async function mintShares(vault: Keypair, mint: string, to: string, amountRaw: bigint, onSigned?: OnSigned): Promise<Sent> {
  const m = new PublicKey(mint);
  const owner = new PublicKey(to);
  const dest = ata(m, owner);
  return send(
    vault,
    [
      createAssociatedTokenAccountIdempotentInstruction(vault.publicKey, dest, owner, m),
      createMintToInstruction(m, dest, vault.publicKey, amountRaw),
    ],
    [],
    onSigned,
  );
}

export async function burnShares(vault: Keypair, mint: string, amountRaw: bigint): Promise<Sent> {
  const m = new PublicKey(mint);
  return send(vault, [createBurnInstruction(ata(m, vault.publicKey), m, vault.publicKey, amountRaw)]);
}

/** Burns tokens the vault holds of any mint (the $ASTRA buyback). */
export async function burnTokens(vault: Keypair, mint: string, amountRaw: bigint, onSigned?: OnSigned): Promise<Sent> {
  const m = new PublicKey(mint);
  const program = await programOf(m);
  return send(vault, [createBurnInstruction(ata(m, vault.publicKey, program), m, vault.publicKey, amountRaw, [], program)], [], onSigned);
}

const transferIxs = async (payer: PublicKey, from: PublicKey, mint: string | "SOL", to: PublicKey, amountRaw: bigint, decimals: number): Promise<TransactionInstruction[]> => {
  if (mint === "SOL") return [SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: amountRaw })];
  const m = new PublicKey(mint);
  const program = await programOf(m);
  const destAta = ata(m, to, program);
  return [
    createAssociatedTokenAccountIdempotentInstruction(payer, destAta, to, m, program),
    createTransferCheckedInstruction(ata(m, from, program), m, destAta, from, amountRaw, decimals, [], program),
  ];
};

/**
 * Sends `amountRaw` of `mint` (or lamports for SOL) from `from` to `to`, opening
 * the recipient's token account if needed — paid by `payer`.
 */
export async function transfer(
  payer: Keypair,
  from: Keypair,
  mint: string | "SOL",
  to: string,
  amountRaw: bigint,
  decimals: number,
  onSigned?: OnSigned,
): Promise<Sent> {
  const ixs = await transferIxs(payer.publicKey, from.publicKey, mint, new PublicKey(to), amountRaw, decimals);
  return send(payer, ixs, from === payer ? [] : [from], onSigned);
}

/** A custodial user pays an order: the amount and the network fee, in one transaction. */
export async function payIn(user: Keypair, mint: string | "SOL", to: string, amountRaw: bigint, decimals: number, networkLamports: bigint): Promise<Sent> {
  const dest = new PublicKey(to);
  const ixs = await transferIxs(user.publicKey, user.publicKey, mint, dest, amountRaw, decimals);
  if (networkLamports > 0n) ixs.push(SystemProgram.transfer({ fromPubkey: user.publicKey, toPubkey: dest, lamports: networkLamports }));
  return send(user, ixs);
}

/** An owner's balance of `mint` in base units (0 when it has no account). */
export async function tokenBalance(owner: string, mint: string): Promise<bigint> {
  try {
    const m = new PublicKey(mint);
    const r = await rpc().getTokenAccountBalance(ata(m, new PublicKey(owner), await programOf(m)), COMMITMENT);
    return BigInt(r.value.amount);
  } catch {
    return 0n;
  }
}
