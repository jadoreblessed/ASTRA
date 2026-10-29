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
upstream still can't spend past it. Live mode is its own env file and its own
database, so the dev database and its public dev key never hold a lamport:

```bash
npm run live:setup   # once: writes .env.live — fresh MASTER_KEY, trading on, $2 orders, 0.05 SOL cap
npm run dev:live     # api + signer + worker on .env.live
```

**Back up the `MASTER_KEY` line of `.env.live` first** — it opens the vault.
Trading refuses to start without a real `MASTER_KEY`. Swap the public RPC in
`.env.live` for a free Helius key if swaps drop.

Fund the **vault** (`vault` at `/api/config`, its balance is `vaultSol`) with
**0.04 SOL** for fees and rent, and your own Phantom with ~$2 of USDC plus
~0.01 SOL for its own fees.

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

1. Log in with Phantom, buy $1 of the basket. Phantom shows one plain USDC
   transfer to the vault; the line under the slider follows the order to
   "Filled". Watch the log: one swap per asset, one mint.
2. `GET /api/me` shows your shares; your Phantom shows the share token.
3. Redeem all of it. You receive the SOL and BONK; the share token is burned.
4. `GET /api/config` — `spentSol` should read under 0.01.

Then stop `dev:live` until the launch.

### If something goes wrong

Nothing is kept on a failure:

- a buy leg that can't fill (no route, slippage, a dropped transaction) is
  sent back to you; a buy that fills nothing ends `refunded` with the whole
  payment returned,
- shares are handed back if the burn fails; a sell leg that can't swap pays
  out the token itself, as a redeem would,
- a payment the site signed but never confirmed (closed tab, lost connection)
  is handed in again on your next visit,
- an order stopped mid-execution by a crash is parked as `failed` after 20
  minutes, never retried blind — check the vault and the log.

Every refund and payout costs a network fee, counted against the 0.05 SOL cap
like everything else.
