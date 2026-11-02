import { closeDb } from "./db.js";
import { log } from "./logger.js";
import { migrate } from "./util/migrate.js";
import { startApi } from "./server.js";
import { startSigner } from "./signer/service.js";
import { startWorker } from "./workers/index.js";

/**
 * Local dev in one process: api + signer + worker. Required with the embedded
 * PGlite database (one process owns it); with DATABASE_URL set you can also run
 * the three separately, as production does.
 */
async function main() {
  await migrate();
  await startSigner();
  await startApi();
  await startWorker();
}

// Ctrl+C closes the embedded database cleanly — a hard kill mid-write can corrupt it.
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"] as const) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    log.info({ sig }, "shutting down");
    void closeDb()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
}

main().catch((err) => {
  log.error({ err }, "dev server failed");
  process.exit(1);
});
