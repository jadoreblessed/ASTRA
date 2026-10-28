import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { log } from "../logger.js";

/**
 * AES-256-GCM for wallet keys at rest — custodial user wallets and the vault.
 * The master key never leaves the environment; a database dump on its own
 * opens nothing.
 */
const ALGO = "aes-256-gcm";

let warned = false;
export function masterKey(): Buffer {
  if (!config.MASTER_KEY) {
    if (!warned) {
      log.warn("MASTER_KEY is empty — using a throwaway dev key. Wallets made now are lost when you set a real one.");
      warned = true;
    }
    return createHash("sha256").update("astra-dev-master-key").digest();
  }
  const key = Buffer.from(config.MASTER_KEY, "base64");
  if (key.length !== 32) throw new Error(`MASTER_KEY must decode to 32 bytes, got ${key.length}. Run: npm run keys`);
  return key;
}

export interface Sealed {
  nonce: Buffer;
  ciphertext: Buffer;
}

export function seal(plaintext: Uint8Array, aad: string): Sealed {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGO, masterKey(), nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  return { nonce, ciphertext: Buffer.concat([body, cipher.getAuthTag()]) };
}

export function open(sealed: Sealed, aad: string): Buffer {
  const { nonce, ciphertext } = sealed;
  if (ciphertext.length < 17) throw new Error("ciphertext too short");
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const body = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv(ALGO, masterKey(), nonce);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const randomId = (bytes = 16) => randomBytes(bytes).toString("hex");
export const sixDigits = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
