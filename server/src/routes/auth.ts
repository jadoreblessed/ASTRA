import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../db.js";
import { signer } from "../signer/client.js";
import { createChallenge, endSession, requireUser, startEmail, userFor, validEmail, verifyChallenge, verifyEmail } from "../http/auth.js";

const emailBody = z.object({ email: z.string().trim().toLowerCase() });
const codeBody = z.object({ email: z.string().trim().toLowerCase(), code: z.string().regex(/^\d{6}$/) });
const walletBody = z.object({ wallet: z.string().min(32).max(44) });
const signedBody = z.object({ wallet: z.string().min(32).max(44), nonce: z.string(), signature: z.string() });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const strict = { config: { rateLimit: { max: 8, timeWindow: "10 minutes" } } };

  app.post("/api/auth/email/start", strict, async (req, reply) => {
    const p = emailBody.safeParse(req.body);
    if (!p.success || !validEmail(p.data.email)) return reply.code(400).send({ error: "That email doesn't look right." });
    return { sent: true, ...(await startEmail(p.data.email)) };
  });

  app.post("/api/auth/email/verify", strict, async (req, reply) => {
    const p = codeBody.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Enter the six-digit code." });
    const token = await verifyEmail(p.data.email, p.data.code);
    if (!token) return reply.code(401).send({ error: "That code is wrong or expired." });
    return { token };
  });

  app.post("/api/auth/wallet/nonce", async (req, reply) => {
    const p = walletBody.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Bad wallet address." });
    return createChallenge(p.data.wallet);
  });

  app.post("/api/auth/wallet/verify", strict, async (req, reply) => {
    const p = signedBody.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Bad signature." });
    const token = await verifyChallenge(p.data.wallet, p.data.nonce, p.data.signature);
    if (!token) return reply.code(401).send({ error: "Signature didn't verify." });
    return { token };
  });

  app.get("/api/me", async (req, reply) => {
    const u = await userFor(req);
    if (!u) return reply.code(401).send({ error: "Not logged in.", code: "auth" });
    const { rows } = await query<{ basket_id: string; code: string; name: string; shares_raw: string }>(
      `SELECT h.basket_id, b.code, b.name, h.shares_raw::text AS shares_raw
         FROM holdings_by_user h JOIN baskets b ON b.id = h.basket_id
        WHERE h.user_id = $1 AND h.shares_raw > 0`,
      [u.id],
    );
    return {
      user: { id: u.id, email: u.email, wallet: u.wallet, custodial: u.custodial },
      positions: rows.map((r) => ({ basket: r.basket_id, code: r.code, name: r.name, shares: Number(r.shares_raw) / 1e6 })),
    };
  });

  app.post("/api/auth/logout", async (req) => {
    await endSession(req);
    return { ok: true };
  });

  /** The custodial key, to its owner, only within minutes of a login. */
  app.post("/api/me/export", strict, async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    if (!u.custodial) return reply.code(400).send({ error: "Your keys are already in your own wallet." });
    if (!u.fresh) return reply.code(403).send({ error: "Log in again to export your key.", code: "stale_login" });
    const r = await signer<string>("/export", { userId: u.id });
    if (!r.ok) return reply.code(503).send({ error: "Export is unavailable right now." });
    return { secretKey: r.result };
  });
}
