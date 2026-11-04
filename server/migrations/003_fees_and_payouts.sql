-- The buyer pays the network, the platform takes a commission, and everything
-- owed back to a user goes through a queue that can't lose it or pay it twice.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS network_fee_lamports bigint NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_fee_raw bigint NOT NULL DEFAULT 0;
-- what the order becomes once its payouts have all gone out.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settles_to text;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('awaiting_deposit', 'paid', 'executing', 'settling', 'filled', 'refunded', 'failed', 'refused'));

-- A negative row is a credit: what a buyer prepaid for this order's network
-- costs. The sum is therefore what the platform has really paid from its own
-- pocket, and that is what MAX_TOTAL_SPEND_LAMPORTS caps.
ALTER TABLE spend_ledger ADD COLUMN IF NOT EXISTS order_id text;
CREATE INDEX IF NOT EXISTS spend_ledger_order_idx ON spend_ledger (order_id);

-- Everything going to a user: refunds, redeemed tokens, proceeds, shares.
-- `sig` is written before the transaction is sent, so a retry can first ask the
-- chain whether the last attempt already landed.
CREATE TABLE IF NOT EXISTS payouts (
  id          bigserial PRIMARY KEY,
  order_id    text NOT NULL REFERENCES orders(id),
  wallet      text NOT NULL,
  -- a mint address, or 'SOL'
  mint        text NOT NULL,
  raw         bigint NOT NULL,
  decimals    int NOT NULL,
  -- refund | change | shares | shares_back | redeem | in_kind | proceeds
  reason      text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  sig         text,
  attempts    int NOT NULL DEFAULT 0,
  error       text,
  next_try_at timestamptz NOT NULL DEFAULT now(),
  -- when `sig` was signed: past a blockhash's life it can no longer land.
  attempted_at timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payouts_due_idx ON payouts (status, next_try_at);
CREATE INDEX IF NOT EXISTS payouts_order_idx ON payouts (order_id);

-- The commission, per order, until it is withdrawn or spent on a buyback.
CREATE TABLE IF NOT EXISTS fee_ledger (
  id       bigserial PRIMARY KEY,
  order_id text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USDC', 'SOL')),
  raw      bigint NOT NULL,
  -- null: still accrued. Otherwise the transaction that took it.
  taken_sig text,
  at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_ledger_open_idx ON fee_ledger (currency, taken_sig);

-- $ASTRA bought with commission and burned.
CREATE TABLE IF NOT EXISTS burns (
  id       bigserial PRIMARY KEY,
  mint     text NOT NULL,
  raw      bigint NOT NULL,
  decimals int NOT NULL,
  swap_sig text,
  burn_sig text NOT NULL,
  at       timestamptz NOT NULL DEFAULT now()
);
