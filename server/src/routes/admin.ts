import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { config, isProd } from "../config.js";
import { one, query } from "../db.js";
import { log } from "../logger.js";
import { safeEqual } from "../util/crypto.js";

/**
 * The few links the site shows that change at launch — the token's contract
 * address and the social accounts — kept in the database so they can be set
 * from /admin without a redeploy.
 *
 * Public: GET /api/site. Admin: POST /api/admin/site and /api/admin/check,
 * behind ADMIN_TOKEN (sent as `x-admin-token`). In development an unset token
 * falls back to "astra-admin"; in production an unset token turns admin off.
 */

export interface SiteLinks {
  ca: string;
  x: string;
  telegram: string;
}

const EMPTY: SiteLinks = { ca: "", x: "", telegram: "" };
const KEY = "site";

export async function siteLinks(): Promise<SiteLinks> {
  const row = await one<{ value: string }>(`SELECT value FROM kv WHERE key = $1`, [KEY]);
  if (!row) return EMPTY;
  try {
    return { ...EMPTY, ...(JSON.parse(row.value) as Partial<SiteLinks>) };
  } catch {
    return EMPTY;
  }
}

const adminToken = (): string | null => config.ADMIN_TOKEN || (isProd ? null : "astra-admin");

/** A link the way people paste it: "x.com/handle" becomes "https://x.com/handle". */
const asUrl = (s: string) => (s && !/^https?:\/\//i.test(s) ? `https://${s}` : s);

const body = z.object({
  ca: z.string().trim().max(100).default(""),
  x: z.string().trim().max(300).default(""),
  telegram: z.string().trim().max(300).default(""),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  if (!config.ADMIN_TOKEN && !isProd) log.warn('ADMIN_TOKEN is empty — /admin uses the dev key "astra-admin". Set one before deploying.');

  const allowed = (req: FastifyRequest, reply: FastifyReply): boolean => {
    const token = adminToken();
    if (!token) {
      void reply.code(403).send({ error: "Admin is off. Set ADMIN_TOKEN on the server." });
      return false;
    }
    if (!safeEqual(String(req.headers["x-admin-token"] ?? ""), token)) {
      void reply.code(401).send({ error: "Wrong admin key." });
      return false;
    }
    return true;
  };

  app.get("/api/site", async () => ({ links: await siteLinks() }));

  const strict = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

  app.post("/api/admin/check", strict, async (req, reply) => {
    if (!allowed(req, reply)) return;
    return { ok: true };
  });

  app.post("/api/admin/site", strict, async (req, reply) => {
    if (!allowed(req, reply)) return;
    const p = body.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "Those links are too long." });
    const links: SiteLinks = { ca: p.data.ca, x: asUrl(p.data.x), telegram: asUrl(p.data.telegram) };
    await query(`INSERT INTO kv (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [KEY, JSON.stringify(links)]);
    log.info({ ca: links.ca, x: links.x, telegram: links.telegram }, "site links updated");
    return { links };
  });
}
