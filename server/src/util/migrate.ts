import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { query, closeDb } from "../db.js";
import { log } from "../logger.js";

/** Applies migrations/*.sql in order, once each. */
export async function migrate(): Promise<void> {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())`);
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const done = await query(`SELECT 1 FROM schema_migrations WHERE name = $1`, [file]);
    if (done.rows.length > 0) continue;
    const sql = await readFile(join(dir, file), "utf8");
    // Statements are separated by `;` at line end — no function bodies here.
    for (const stmt of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
      await query(stmt);
    }
    await query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
    log.info({ file }, "migration applied");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  migrate()
    .then(() => closeDb())
    .catch((err) => {
      log.error({ err }, "migration failed");
      process.exit(1);
    });
}
