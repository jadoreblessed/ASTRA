import pg from "pg";
import { config } from "./config.js";
import { log } from "./logger.js";

/**
 * Postgres access — plain SQL. With `DATABASE_URL` set it is a real pooled
 * Postgres (production, docker compose). Without it, an embedded PGlite (real
 * Postgres compiled to WASM) keeps its data on disk in `PGLITE_DIR`, so a fresh
 * clone runs with nothing installed. Same SQL either way.
 *
 * PGlite is single-process: in that mode run everything through `npm run
 * dev:all`, which hosts api, worker and signer in one process.
 *
 * Money columns are bigint and come back as strings; parse with BigInt().
 */

export type Row = Record<string, unknown>;

interface Driver {
  query(text: string, params: unknown[]): Promise<{ rows: Row[]; rowCount: number }>;
  close(): Promise<void>;
}

const makeDriver = async (): Promise<Driver> => {
  if (config.DATABASE_URL) {
    pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
    const pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: config.DATABASE_POOL_MAX,
      ...(config.DATABASE_URL.includes("sslmode=require") ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    pool.on("error", (err) => log.error({ err }, "idle postgres client errored"));
    return {
      query: async (text, params) => {
        const r = await pool.query(text, params);
        return { rows: r.rows as Row[], rowCount: r.rowCount ?? 0 };
      },
      close: () => pool.end(),
    };
  }

  const { PGlite, types } = await import("@electric-sql/pglite");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(config.PGLITE_DIR, { recursive: true });
  const db = new PGlite(config.PGLITE_DIR, {
    parsers: {
      [types.NUMERIC]: (v: string) => (v === null ? null : Number(v)),
      [types.INT8]: (v: string) => v,
    },
  });
  await db.waitReady;
  log.info({ dir: config.PGLITE_DIR }, "embedded postgres (PGlite) ready");
  return {
    query: async (text, params) => {
      const r = await db.query<Row>(text, params);
      return { rows: r.rows, rowCount: r.rows.length > 0 ? r.rows.length : (r.affectedRows ?? 0) };
    },
    close: () => db.close(),
  };
};

let driver: Promise<Driver> | null = null;
const get = () => (driver ??= makeDriver());

/** PGlite runs one statement at a time; serialise so callers never interleave. */
let chain: Promise<unknown> = Promise.resolve();

export async function query<T extends object = Row>(text: string, params: unknown[] = []) {
  const d = await get();
  const run = async () => {
    const started = Date.now();
    try {
      const res = await d.query(text, params);
      const ms = Date.now() - started;
      if (ms > 500) log.warn({ ms, text: text.slice(0, 120) }, "slow query");
      return res as unknown as { rows: T[]; rowCount: number };
    } catch (err) {
      log.error({ err, text: text.slice(0, 200) }, "query failed");
      throw err;
    }
  };
  if (config.DATABASE_URL) return run();
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
}

export async function one<T extends object = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const { rows } = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function closeDb(): Promise<void> {
  if (driver) await (await driver).close();
}
