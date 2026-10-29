-- A failed order sends the money back: it ends as `refunded`, not `failed`.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('awaiting_deposit', 'paid', 'executing', 'filled', 'refunded', 'failed', 'refused'));
