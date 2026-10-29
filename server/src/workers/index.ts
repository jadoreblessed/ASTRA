import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { query } from "../db.js";
import { log } from "../logger.js";
import { migrate } from "../util/migrate.js";
import { seed, settleUnits } from "../services/seed.js";
import { sweepExpired } from "../http/auth.js";
import { signer } from "../signer/client.js";
import { backfillHistory, refreshPrices, syncTokens } from "./market.js";

/**
 * The background loop. Market data on fixed cadences; paid orders handed to the
 * signer one at a time. Each job is isolated — one failing never stops the
 * others — and none of them signs anything itself.
 */

const every = (ms: number, name: string, fn: () => Promise<unknown>) => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (err) {
      log.warn({ job: name, err: String(err) }, "job failed");
    } finally {
      running = false;
    }
  };
  void run();
  return setInterval(run, ms);
};

async function processOrders(): Promise<void> {
  if (!config.TRADING_ENABLED) return;
  // An order caught mid-execution by a crash is never retried blind — it is
  // parked for a look at the vault and the log.
  await query(
    `UPDATE orders SET status = 'failed', error = 'Stopped while executing — check the vault and the log before retrying.', updated_at = now()
      WHERE status = 'executing' AND updated_at < now() - interval '20 minutes'`,
  );
  const { rows } = await query<{ id: string }>(`SELECT id FROM orders WHERE status = 'paid' ORDER BY created_at LIMIT 5`);
  for (const o of rows) {
    const r = await signer("/execute", { orderId: o.id });
    log.info({ order: o.id, ok: r.ok, ...(r.ok ? {} : { code: r.code, error: r.error }) }, "order executed");
  }
}

export async function startWorker(): Promise<void> {
  await migrate();
  await seed();
  log.info({ trading: config.TRADING_ENABLED }, "worker started");
  // Tokens first so prices have mints to ask for, then history, then units.
  await syncTokens().catch((err) => log.warn({ err: String(err) }, "initial token sync failed"));
  await refreshPrices().catch((err) => log.warn({ err: String(err) }, "initial price refresh failed"));

  every(config.TOKEN_SYNC_MIN * 60_000, "tokens", syncTokens);
  every(config.PRICE_REFRESH_SEC * 1000, "prices", async () => {
    await refreshPrices();
    await settleUnits();
  });
  every(30_000, "history", () => backfillHistory(10));
  every(5_000, "orders", processOrders);
  every(15 * 60_000, "sweep", sweepExpired);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startWorker().catch((err) => {
    log.error({ err }, "worker failed to start");
    process.exit(1);
  });
}
