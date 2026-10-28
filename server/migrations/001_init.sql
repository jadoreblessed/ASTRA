-- ASTRA backend — initial schema.

CREATE TABLE IF NOT EXISTS kv (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Everything a basket can hold. `mint` is resolved against Jupiter's verified
-- token list by the worker; an asset with no mint is not listed.
CREATE TABLE IF NOT EXISTS assets (
  symbol      text PRIMARY KEY,
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('stock', 'crypto', 'meme')),
  logo        text,
  mark        text,
  mint        text UNIQUE,
  decimals    int,
  icon_url    text,
  listed      boolean NOT NULL DEFAULT false,
  usd_price   numeric,
  change_24h  numeric,
  mcap        numeric,
  volume_24h  numeric,
  holders     int,
  price_at    timestamptz,
  synced_at   timestamptz
);

-- One close per asset per UTC day, backfilled from GeckoTerminal and kept
-- current from live prices.
CREATE TABLE IF NOT EXISTS asset_daily (
  symbol text NOT NULL REFERENCES assets(symbol) ON DELETE CASCADE,
  day    date NOT NULL,
  close  numeric NOT NULL,
  PRIMARY KEY (symbol, day)
);

CREATE TABLE IF NOT EXISTS users (
  id           text PRIMARY KEY,
  email        text UNIQUE,
  wallet       text UNIQUE NOT NULL,
  -- custodial: we made the wallet (email login) and hold its key, sealed.
  custodial    boolean NOT NULL DEFAULT false,
  sealed_nonce bytea,
  sealed_key   bytea,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_codes (
  email      text PRIMARY KEY,
  code_hash  text NOT NULL,
  attempts   int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_challenges (
  nonce      text PRIMARY KEY,
  wallet     text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- set at login; key export is only allowed while the login is this fresh.
  fresh_until timestamptz NOT NULL,
  expires_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS baskets (
  id          text PRIMARY KEY,
  code        text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  creator_id  text REFERENCES users(id) ON DELETE SET NULL,
  curated     boolean NOT NULL DEFAULT false,
  rebalance   text NOT NULL DEFAULT 'Every 30 days or 5% drift',
  access      text NOT NULL DEFAULT 'public',
  -- the share token; null until the basket is deployed on chain.
  share_mint  text UNIQUE,
  share_decimals int NOT NULL DEFAULT 6,
  shares_raw  bigint NOT NULL DEFAULT 0,
  -- index level a share starts at.
  base_nav    numeric NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- `units` is how much of the asset (in whole tokens) one share is made of; it
-- is fixed at inception so the share price is simply sum(units * price).
-- `vault_raw` is the basket's own slice of the shared vault, in base units.
CREATE TABLE IF NOT EXISTS basket_holdings (
  basket_id  text NOT NULL REFERENCES baskets(id) ON DELETE CASCADE,
  symbol     text NOT NULL REFERENCES assets(symbol),
  weight_bps int  NOT NULL CHECK (weight_bps > 0 AND weight_bps <= 10000),
  units      numeric NOT NULL,
  vault_raw  bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (basket_id, symbol)
);

CREATE TABLE IF NOT EXISTS basket_nav (
  basket_id text NOT NULL REFERENCES baskets(id) ON DELETE CASCADE,
  at        timestamptz NOT NULL,
  nav       numeric NOT NULL,
  PRIMARY KEY (basket_id, at)
);

CREATE TABLE IF NOT EXISTS holdings_by_user (
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  basket_id  text NOT NULL REFERENCES baskets(id) ON DELETE CASCADE,
  shares_raw bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, basket_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id            text PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users(id),
  basket_id     text NOT NULL REFERENCES baskets(id),
  side          text NOT NULL CHECK (side IN ('buy', 'sell', 'redeem')),
  currency      text NOT NULL CHECK (currency IN ('USDC', 'SOL')),
  -- buy: what is paid in, in `currency`; sell/redeem: shares, whole units.
  amount        numeric NOT NULL,
  amount_raw    bigint NOT NULL,
  status        text NOT NULL DEFAULT 'awaiting_deposit'
                CHECK (status IN ('awaiting_deposit', 'paid', 'executing', 'filled', 'failed', 'refused')),
  deposit_sig   text UNIQUE,
  quote         jsonb,
  result        jsonb,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Everything the platform itself pays out of the vault in SOL: network fees
-- and account rent. Checked against MAX_TOTAL_SPEND_LAMPORTS before any send.
CREATE TABLE IF NOT EXISTS spend_ledger (
  id       bigserial PRIMARY KEY,
  lamports bigint NOT NULL,
  reason   text NOT NULL,
  sig      text,
  at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status, created_at);
CREATE INDEX IF NOT EXISTS basket_nav_recent_idx ON basket_nav (basket_id, at DESC);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
