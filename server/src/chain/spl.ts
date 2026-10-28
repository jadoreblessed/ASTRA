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
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { rpc, COMMITMENT } from "./rpc.js";

/**
 * The few chain writes ASTRA makes — no custom program, so nothing to deploy:
 * a basket's share is a plain SPL mint whose authority is the vault. Each
 * helper returns the signature and what it cost the fee payer in lamports
 * (fee + any rent), read back from the confirmed transaction.
 */

export interface Sent {
  sig: string;
  costLamports: number;
}

const PRIORITY = [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 })];

async function send(payer: Keypair, ixs: TransactionInstruction[], extra: Keypair[] = []): Promise<Sent> {
  const c = rpc();
  const before = await c.getBalance(payer.publicKey, COMMITMENT);
  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash(COMMITMENT);
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(...PRIORITY, ...ixs);
  tx.sign(payer, ...extra);
  const sig = await c.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  const res = await c.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, COMMITMENT);
  if (res.value.err) throw new Error(`transaction failed: ${JSON.stringify(res.value.err)}`);
  const after = await c.getBalance(payer.publicKey, COMMITMENT);
  return { sig, costLamports: Math.max(0, before - after) };
}

/** Signs and sends a prepared versioned transaction (a Jupiter swap). */
export async function sendVersioned(payer: Keypair, base64: string): Promise<Sent> {
  const c = rpc();
  const before = await c.getBalance(payer.publicKey, COMMITMENT);
  const tx = VersionedTransaction.deserialize(Buffer.from(base64, "base64"));
  tx.sign([payer]);
  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash(COMMITMENT);
  const sig = await c.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  const res = await c.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, COMMITMENT);
  if (res.value.err) throw new Error(`swap failed: ${JSON.stringify(res.value.err)}`);
  const after = await c.getBalance(payer.publicKey, COMMITMENT);
  return { sig, costLamports: Math.max(0, before - after) };
}

/** Estimated rent for a new mint, for the budget check before sending. */
export const mintRent = () => getMinimumBalanceForRentExemptMint(rpc());
export const ATA_RENT = 2_039_280;
export const FEE_ESTIMATE = 15_000;

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
  );
}

const ata = (mint: PublicKey, owner: PublicKey, program = TOKEN_PROGRAM_ID) =>
  getAssociatedTokenAddressSync(mint, owner, true, program);

/** Classic SPL or Token-2022 (xStocks are Token-2022) — read off the mint account. */
const programs = new Map<string, PublicKey>();
async function programOf(mint: PublicKey): Promise<PublicKey> {
  const key = mint.toBase58();
  const hit = programs.get(key);
  if (hit) return hit;
  const info = await rpc().getAccountInfo(mint, COMMITMENT);
  if (!info) throw new Error(`mint ${key} not found`);
  const program = info.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  programs.set(key, program);
  return program;
}

export async function mintShares(vault: Keypair, mint: string, to: string, amountRaw: bigint): Promise<Sent> {
  const m = new PublicKey(mint);
  const owner = new PublicKey(to);
  const dest = ata(m, owner);
  return send(vault, [
    createAssociatedTokenAccountIdempotentInstruction(vault.publicKey, dest, owner, m),
    createMintToInstruction(m, dest, vault.publicKey, amountRaw),
  ]);
}

export async function burnShares(vault: Keypair, mint: string, amountRaw: bigint): Promise<Sent> {
  const m = new PublicKey(mint);
  return send(vault, [createBurnInstruction(ata(m, vault.publicKey), m, vault.publicKey, amountRaw)]);
}

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
): Promise<Sent> {
  const dest = new PublicKey(to);
  if (mint === "SOL") {
    return send(payer, [SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: dest, lamports: amountRaw })], from === payer ? [] : [from]);
  }
  const m = new PublicKey(mint);
  const program = await programOf(m);
  const destAta = ata(m, dest, program);
  return send(
    payer,
    [
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, destAta, dest, m, program),
      createTransferCheckedInstruction(ata(m, from.publicKey, program), m, destAta, from.publicKey, amountRaw, decimals, [], program),
    ],
    from === payer ? [] : [from],
  );
}

/** The vault's balance of `mint` in base units (0 when it has no account). */
export async function tokenBalance(owner: string, mint: string): Promise<bigint> {
  try {
    const m = new PublicKey(mint);
    const r = await rpc().getTokenAccountBalance(ata(m, new PublicKey(owner), await programOf(m)), COMMITMENT);
    return BigInt(r.value.amount);
  } catch {
    return 0n;
  }
}
