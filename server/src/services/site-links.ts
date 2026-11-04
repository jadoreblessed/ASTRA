import { one, query } from "../db.js";

/**
 * The few links the site shows that change at launch — the token's contract
 * address and the social accounts — kept in the database so they can be set
 * from /admin without a redeploy.
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

export async function saveSiteLinks(links: SiteLinks): Promise<void> {
  await query(`INSERT INTO kv (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [
    KEY,
    JSON.stringify(links),
  ]);
}
