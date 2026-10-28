import nacl from "tweetnacl";
import bs58 from "bs58";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config, isProd } from "../config.js";
import { one, query } from "../db.js";
import { log } from "../logger.js";
import { newCustodial } from "../chain/wallet.js";
import { randomId, sha256, sixDigits } from "../util/crypto.js";

/**
 * Two ways in, one session shape:
 *
 *  - **Email** — a six-digit code; first login makes a Solana wallet for the
 *    user (custodial, sealed, exportable). This is the "email is your wallet"
 *    flow from the app.
 *  - **Wallet** — Phantom/Solflare sign a plain-text challenge. Signing moves
 *    nothing and approves nothing.
 *
 * Sessions are bearer tokens. `fresh_until` gates the one sensitive read — key
 * export — to the first minutes after a login.
 */

const CODE_TTL_MIN = 10;
const FRESH_MIN = 10;
const MAX_ATTEMPTS = 5;

export interface SessionUser {
  id: string;
  email: string | null;
  wallet: string;
  custodial: boolean;
  fresh: boolean;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export const validEmail = (e: string) => EMAIL.test(e);

async function sendMail(to: string, code: string): Promise<boolean> {
  if (!config.RESEND_API_KEY) {
    log.info({ to, code }, "login code (no RESEND_API_KEY — printed instead of sent)");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: config.MAIL_FROM,
      to,
      subject: `Your ASTRA code: ${code}`,
      text: `Your ASTRA login code is ${code}. It expires in ${CODE_TTL_MIN} minutes. If you did not ask for it, ignore this email.`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`mail provider → ${res.status}`);
  return true;
}

/** Returns the code only in local dev with no mail provider, so the UI can show it. */
export async function startEmail(email: string): Promise<{ devCode?: string }> {
  const code = sixDigits();
  await query(
    `INSERT INTO login_codes (email, code_hash, attempts, expires_at)
     VALUES ($1, $2, 0, now() + make_interval(mins => $3))
     ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, attempts = 0, expires_at = EXCLUDED.expires_at`,
    [email, sha256(`${email}:${code}`), CODE_TTL_MIN],
  );
  const mailed = await sendMail(email, code);
  return !mailed && !isProd ? { devCode: code } : {};
}

async function newSession(userId: string): Promise<string> {
  const token = randomId(32);
  await query(
    `INSERT INTO sessions (token, user_id, fresh_until, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3), now() + make_interval(hours => $4))`,
    [token, userId, FRESH_MIN, config.SESSION_TTL_HOURS],
  );
  return token;
}

export async function verifyEmail(email: string, code: string): Promise<string | null> {
  const row = await one<{ code_hash: string; attempts: number }>(
    `UPDATE login_codes SET attempts = attempts + 1 WHERE email = $1 AND expires_at > now() RETURNING code_hash, attempts`,
    [email],
  );
  if (!row || row.attempts > MAX_ATTEMPTS) return null;
  if (row.code_hash !== sha256(`${email}:${code}`)) return null;
  await query(`DELETE FROM login_codes WHERE email = $1`, [email]);

  let user = await one<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  if (!user) {
    const w = newCustodial();
    user = await one<{ id: string }>(
      `INSERT INTO users (id, email, wallet, custodial, sealed_nonce, sealed_key) VALUES ($1, $2, $3, true, $4, $5) RETURNING id`,
      [randomId(12), email, w.wallet, w.nonce, w.ciphertext],
    );
    log.info({ wallet: w.wallet }, "custodial wallet created");
  }
  return newSession(user!.id);
}

export function challengeMessage(wallet: string, nonce: string): string {
  return [
    "Sign in to ASTRA",
    "",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    "",
    "Signing proves you hold this wallet. It does not approve any transaction and moves no funds.",
  ].join("\n");
}

export async function createChallenge(wallet: string): Promise<{ nonce: string; message: string }> {
  const nonce = randomId(16);
  await query(`INSERT INTO auth_challenges (nonce, wallet, expires_at) VALUES ($1, $2, now() + interval '10 minutes')`, [nonce, wallet]);
  return { nonce, message: challengeMessage(wallet, nonce) };
}

export async function verifyChallenge(wallet: string, nonce: string, signatureB58: string): Promise<string | null> {
  const row = await one<{ wallet: string }>(
    `DELETE FROM auth_challenges WHERE nonce = $1 AND wallet = $2 AND expires_at > now() RETURNING wallet`,
    [nonce, wallet],
  );
  if (!row) return null;
  let ok = false;
  try {
    ok = nacl.sign.detached.verify(new TextEncoder().encode(challengeMessage(wallet, nonce)), bs58.decode(signatureB58), bs58.decode(wallet));
  } catch {
    return null;
  }
  if (!ok) return null;
  let user = await one<{ id: string }>(`SELECT id FROM users WHERE wallet = $1`, [wallet]);
  if (!user) user = await one<{ id: string }>(`INSERT INTO users (id, wallet, custodial) VALUES ($1, $2, false) RETURNING id`, [randomId(12), wallet]);
  return newSession(user!.id);
}

const bearer = (req: FastifyRequest) => {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
};

export async function userFor(req: FastifyRequest): Promise<SessionUser | null> {
  const token = bearer(req);
  if (!token) return null;
  const row = await one<{ id: string; email: string | null; wallet: string; custodial: boolean; fresh: boolean }>(
    `SELECT u.id, u.email, u.wallet, u.custodial, (s.fresh_until > now()) AS fresh
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
  return row ?? null;
}

/** For handlers that need a user: replies 401 and returns null when there is none. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<SessionUser | null> {
  const u = await userFor(req);
  if (!u) {
    reply.code(401).send({ error: "Log in first.", code: "auth" });
    return null;
  }
  return u;
}

export async function endSession(req: FastifyRequest): Promise<void> {
  const token = bearer(req);
  if (token) await query(`DELETE FROM sessions WHERE token = $1`, [token]);
}

export async function sweepExpired(): Promise<void> {
  await query(`DELETE FROM sessions WHERE expires_at < now()`);
  await query(`DELETE FROM auth_challenges WHERE expires_at < now()`);
  await query(`DELETE FROM login_codes WHERE expires_at < now()`);
}
