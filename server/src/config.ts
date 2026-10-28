import { z } from "zod";

/**
 * Every setting the services read, validated once at boot.
 *
 * The defaults are chosen so that `npm run dev:all` with no `.env` at all gives
 * a working, read-only backend: an embedded Postgres (PGlite) on disk, live
 * prices from Jupiter, email login with the code printed to the console, and
 * every switch that could move money OFF. Nothing below defaults to spending.
 */
const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8080),
  SIGNER_PORT: z.coerce.number().default(8081),
  SIGNER_HOST: z.string().default("127.0.0.1"),
  LOG_LEVEL: z.string().default("info"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),

  /** Empty → an embedded PGlite database in `PGLITE_DIR` (local dev, zero setup). */
  DATABASE_URL: z.string().default(""),
  PGLITE_DIR: z.string().default("./.data/pg"),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  // ---------------------------------------------------------------- chain
  SOLANA_CLUSTER: z.enum(["devnet", "mainnet-beta"]).default("mainnet-beta"),
  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),
  JUPITER_API: z.string().url().default("https://lite-api.jup.ag"),
  GECKO_API: z.string().url().default("https://api.geckoterminal.com/api/v2"),

  /**
   * 32 bytes, base64 — seals every custodial wallet key and the vault key at
   * rest. `npm run keys` prints a fresh one. Empty in dev → a throwaway key is
   * derived and a warning printed; never run production like that.
   */
  MASTER_KEY: z.string().default(""),
  /** Shared secret between api/worker and the signer. */
  SIGNER_TOKEN: z.string().default("dev-signer-token-change-me"),
  /** The vault wallet that holds every basket's underlying tokens, sealed with MASTER_KEY (base64 JSON). Empty → generated on first boot. */
  VAULT_SEALED: z.string().default(""),

  // ---------------------------------------------------------------- email
  /** Resend API key for login codes. Empty → codes are printed to the log. */
  RESEND_API_KEY: z.string().default(""),
  MAIL_FROM: z.string().default("ASTRA <login@astra.local>"),

  // ---------------------------------------------------------------- risk
  /**
   * The master switch for anything that touches the chain with money: basket
   * mints, swaps, share mints, redemptions. Off → quotes are real, orders are
   * refused before they reach the signer.
   */
  TRADING_ENABLED: bool.default(false),
  /**
   * Hard ceiling on everything the platform itself spends — network fees and
   * account rent — summed over the life of the database. 0.05 SOL by default:
   * the whole smoke test fits inside it, and nothing can spend past it.
   */
  MAX_TOTAL_SPEND_LAMPORTS: z.coerce.number().int().default(50_000_000),
  /** Largest single order, in USD. */
  MAX_ORDER_USD: z.coerce.number().default(5),
  /** Price limit on every swap leg, basis points. */
  MAX_SLIPPAGE_BPS: z.coerce.number().int().default(100),
  /** Prices older than this refuse to trade ("price freshness < 2 min or no trade"). */
  PRICE_MAX_AGE_SEC: z.coerce.number().int().default(120),
  /** Up to 14 assets in a basket. */
  MAX_BASKET_ASSETS: z.coerce.number().int().default(14),

  SESSION_TTL_HOURS: z.coerce.number().default(24 * 14),

  // ---------------------------------------------------------------- worker cadence
  PRICE_REFRESH_SEC: z.coerce.number().default(30),
  TOKEN_SYNC_MIN: z.coerce.number().default(60),
  NAV_SNAPSHOT_SEC: z.coerce.number().default(60),
});

export type Config = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config: Config = parsed.data;
export const isProd = config.NODE_ENV === "production";

if (isProd && !config.MASTER_KEY) {
  console.error("MASTER_KEY is required in production. Generate one with `npm run keys`.");
  process.exit(1);
}
if (isProd && config.SIGNER_TOKEN === "dev-signer-token-change-me") {
  console.error("SIGNER_TOKEN must be set in production.");
  process.exit(1);
}
