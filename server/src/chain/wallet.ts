import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "../config.js";
import { one, query } from "../db.js";
import { log } from "../logger.js";
import { open, seal } from "../util/crypto.js";

/**
 * Keys at rest. Two kinds:
 *
 *  - **Custodial user wallets** — made at email login, sealed per user with the
 *    master key (AAD binds the ciphertext to its address). Exportable by the
 *    user; opened only inside the signer.
 *  - **The vault** — one wallet that holds every basket's underlying tokens and
 *    is the mint authority of every share token. Opened only inside the signer.
 *
 * The API process only ever needs public keys.
 */

export interface SealedRow {
  sealed_nonce: Buffer | Uint8Array;
  sealed_key: Buffer | Uint8Array;
  wallet: string;
}

export function newCustodial(): { wallet: string; nonce: Buffer; ciphertext: Buffer } {
  const kp = Keypair.generate();
  const wallet = kp.publicKey.toBase58();
  const { nonce, ciphertext } = seal(kp.secretKey, `user:${wallet}`);
  return { wallet, nonce, ciphertext };
}

export function openCustodial(row: SealedRow): Keypair {
  const secret = open({ nonce: Buffer.from(row.sealed_nonce), ciphertext: Buffer.from(row.sealed_key) }, `user:${row.wallet}`);
  const kp = Keypair.fromSecretKey(new Uint8Array(secret));
  if (kp.publicKey.toBase58() !== row.wallet) throw new Error("sealed key does not match its wallet");
  return kp;
}

export const exportSecret = (kp: Keypair) => bs58.encode(kp.secretKey);

/* ------------------------------------------------------------------- vault */

interface StoredVault {
  wallet: string;
  nonce: string;
  ciphertext: string;
}

const readStored = async (): Promise<StoredVault | null> => {
  if (config.VAULT_SEALED) return JSON.parse(Buffer.from(config.VAULT_SEALED, "base64").toString("utf8")) as StoredVault;
  const row = await one<{ value: string }>(`SELECT value FROM kv WHERE key = 'vault'`);
  return row ? (JSON.parse(row.value) as StoredVault) : null;
};

/** The vault's address, creating the vault on first use. */
export async function vaultAddress(): Promise<string> {
  const stored = await readStored();
  if (stored) return stored.wallet;
  const kp = Keypair.generate();
  const wallet = kp.publicKey.toBase58();
  const { nonce, ciphertext } = seal(kp.secretKey, `vault:${wallet}`);
  const value: StoredVault = { wallet, nonce: nonce.toString("base64"), ciphertext: ciphertext.toString("base64") };
  await query(`INSERT INTO kv (key, value) VALUES ('vault', $1) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(value)]);
  log.info({ wallet }, "vault created — back up the database row `kv.vault` together with MASTER_KEY");
  return (await readStored())!.wallet;
}

/** Signer-only. */
export async function openVault(): Promise<Keypair> {
  await vaultAddress();
  const s = (await readStored())!;
  const secret = open({ nonce: Buffer.from(s.nonce, "base64"), ciphertext: Buffer.from(s.ciphertext, "base64") }, `vault:${s.wallet}`);
  return Keypair.fromSecretKey(new Uint8Array(secret));
}
