import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { log } from "./logger.js";
import { migrate } from "./util/migrate.js";
import { seed } from "./services/seed.js";
import { siteRoutes } from "./routes/site.js";
import { authRoutes } from "./routes/auth.js";
import { tradeRoutes } from "./routes/trade.js";

/** The public API — read-only market data, login, quotes, orders. Holds no keys. */
export async function buildApi() {
  const app = Fastify({ logger: false, trustProxy: true, bodyLimit: 64 * 1024 });
  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    methods: ["GET", "POST"],
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  app.setErrorHandler((err, _req, reply) => {
    log.error({ err }, "request failed");
    reply.code(err.statusCode && err.statusCode < 500 ? err.statusCode : 500).send({ error: err.statusCode && err.statusCode < 500 ? err.message : "Something went wrong." });
  });
  await app.register(siteRoutes);
  await app.register(authRoutes);
  await app.register(tradeRoutes);
  return app;
}

export async function startApi(): Promise<void> {
  await migrate();
  await seed();
  const app = await buildApi();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  log.info({ port: config.PORT, trading: config.TRADING_ENABLED, cluster: config.SOLANA_CLUSTER }, "api listening");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startApi().catch((err) => {
    log.error({ err }, "api failed to start");
    process.exit(1);
  });
}
