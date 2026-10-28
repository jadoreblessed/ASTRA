# Testing ASTRA for ≤ 0.05 SOL

Everything except moving money is free: reading, quoting, logging in and
building baskets run with `TRADING_ENABLED=false` and touch no wallet.

```bash
npm test          # the limits: switch, 0.05 SOL cap, order size, slippage, freshness, basket shape
npm run dev:all   # then use /app — quotes are real Jupiter quotes
```

## Free checks (no SOL)

1. `curl localhost:8080/api/assets` — ~40 tokens with live prices.
2. `curl localhost:8080/api/baskets` — six baskets, each with a 90-day history.
3. In `/app`: log in with email (the code shows in the log and in the UI in dev),
   open a basket, type an amount — every leg gets a Jupiter route and impact.
4. Slide to buy → "Trading opens at the $ASTRA launch." (refused, as it should be).
5. Build a basket in Create → it opens on its own page with its own ticker.

## Paid: one mainnet smoke test, bounded under 0.05 SOL

The cap is enforced by the signer itself (`MAX_TOTAL_SPEND_LAMPORTS`), so a bug
upstream still can't spend past it. Set:

```
TRADING_ENABLED=true
MAX_TOTAL_SPEND_LAMPORTS=50000000   # 0.05 SOL
MAX_ORDER_USD=2
SOLANA_RPC_URL=<a paid RPC>
```

Fund the **vault** (address at `/api/config`) with **0.04 SOL** for fees and
rent, and your own Phantom with ~$2 of USDC plus a little SOL for its own fee.

Use a two-asset basket to keep rent low — build one in Create, e.g. SOL 50% +
BONK 50%.

Where the vault's SOL goes, worst case:

| step | cost |
|---|---|
| share mint for the basket (rent, once) | ~0.0015 SOL |
| vault token account for BONK (rent, once) | ~0.0020 SOL |
| your share token account (rent, once) | ~0.0020 SOL |
| 1 swap + 1 mint (fees + priority) | < 0.0005 SOL |
| redeem: burn + 2 transfers (+ your BONK account if new) | ~0.0025 SOL |
| **total** | **< 0.01 SOL** |

The USDC you pay is not spent — it becomes the basket's holdings, and the
redeem sends it back as SOL + BONK.

Order of the run:

1. Buy $1 of the basket with Phantom. Watch the worker log: one swap, one mint.
2. `GET /api/me` shows your shares; your Phantom shows the share token.
3. Redeem all of it. You receive the SOL and BONK; the share token is burned.
4. `GET /api/config` — `spentSol` should read under 0.01.

Then set `TRADING_ENABLED=false` again until the launch.
