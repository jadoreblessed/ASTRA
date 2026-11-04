# ASTRA — backend

Tokenized baskets on Solana: stocks (xStocks), crypto and memecoins held as one
redeemable token. This is the API, the worker and the signer behind `/app`.

**No custom on-chain program.** A basket's share is a plain SPL mint whose
authority is the vault; buying swaps into the basket through Jupiter, redeeming
burns the share and sends the exact tokens back. Nothing to deploy, nothing to
audit on chain beyond the token program — and the platform's own spending is
capped at **0.05 SOL** for life (see [TESTING.md](TESTING.md)).

Three processes (as in BUREAU):

| process | what it does | reachable from |
|---|---|---|
| `api` | market data, login, quotes, orders | the internet |
| `worker` | token sync, live prices, chart history, hands paid orders to the signer | nothing |
| `signer` | **the only thing that opens a key** — vault and custodial wallets | api + worker only |

## Run it locally — zero setup

```bash
cd server
npm install
npm run dev:all        # api :8080 + signer :8081 + worker, embedded Postgres
```

Then the website (`npm run dev` in the repo root) picks it up at
`http://localhost:8080` (override with `NEXT_PUBLIC_API_URL`). Within a minute
the app shows real prices; the curated baskets' 90-day charts fill in over the
next few minutes as history is paced in from GeckoTerminal.

No `.env` needed: an embedded Postgres (PGlite) lives in `./.data/pg`, login
codes are printed to the log (and offered in the UI, dev only), and trading is
**off**.

## What works

| | |
|---|---|
| Assets | 39 listed tokens, mints verified against Jupiter's list; live price, 24h change, market cap, volume, holders |
| Baskets | 6 curated + anything users build; share price = Σ units × live price; 90-day daily chart from real closes |
| Login | email code → a Solana wallet is made (sealed with `MASTER_KEY`, exportable for 10 min after login); or Phantom / Solflare sign-in |
| Quotes | every leg quoted live by Jupiter with the price limit: route, impact, minimum out, price age |
| Create | up to 14 assets, weights to 100%, its own ticker, page and chart |
| Orders | buy (USDC/SOL → swaps → shares minted), sell (burn → swaps → paid out), redeem (burn → exact tokens) — behind `TRADING_ENABLED` |

## How an order moves

1. `POST /api/quote` — real Jupiter quotes per leg. Free, nothing signed.
2. `POST /api/orders` — refused with `trading_off` until the switch is on.
   Otherwise returns the deposit: vault address, mint, exact amount.
3. Pay:
   - Phantom/Solflare: **one plain transaction** to the vault, readable in the
     wallet: the order and the network fee together. The site posts its
     signature to `/api/orders/:id/deposit` and the API reads the chain to
     confirm the vault received both from that wallet.
   - Email wallet: `/api/orders/:id/pay` — the signer signs the transfer from
     the user's own sealed wallet.
4. The worker hands the paid order to the signer, which re-checks every limit
   and executes, one order at a time: each leg price-limited
   (`MAX_SLIPPAGE_BPS`), every price under `PRICE_MAX_AGE_SEC` old, the order
   under `MAX_ORDER_USD`.
5. Whatever is owed to the user (shares, refunds, tokens, proceeds) goes through
   the `payouts` queue, which retries until it lands and can't pay twice. The
   order stays `settling` until the queue is empty.

## Who pays for what

- **The buyer** prepays network costs in SOL in the same transaction as the
  order (`network_fee_lamports`), so a repeat buy costs the platform nothing.
  What wasn't used comes back when an order is refunded.
- **The platform** pays the shared setup of curated baskets (share mint, vault
  token accounts) while the budget covers it; after that the first buyer does.
  User-made baskets are always paid by the buyer.
- **The commission** is `PLATFORM_FEE_BPS` (0.5%) on buys and sells, nothing on
  redeems. It accrues in `fee_ledger`; `/admin` sends it to `TREASURY_WALLET` or
  spends it on buyback & burn of the contract address set there.

## The switches and caps

`npm run live:setup` writes `.env.live` (fresh keys, its own database, trading
on, the caps below) and `npm run dev:live` runs on it — see
[TESTING.md](TESTING.md). Trading refuses to start without a real `MASTER_KEY`.

```
TRADING_ENABLED=false            # anything that moves money
MAX_TOTAL_SPEND_LAMPORTS=50000000   # 0.05 SOL — lifetime cap on what the platform itself pays
MAX_ORDER_USD=5
PLATFORM_FEE_BPS=50
TREASURY_WALLET=                 # the only place /admin can withdraw commission to
MAX_SLIPPAGE_BPS=100
PRICE_MAX_AGE_SEC=120
```

Every SOL the vault pays is written to `spend_ledger`, and what buyers prepaid
is credited there; the signer refuses any send that would take the net past the
cap, counting what's still on its way. Money owed to a user goes out regardless
of the cap and the pause. `/api/config` shows spent vs cap.

## Production

[`deploy/README.md`](../deploy/README.md): one script on a clean Ubuntu server,
no Docker. Postgres, Node, Caddy for HTTPS, systemd, a daily database dump.
`Dockerfile` and `docker-compose.yml` here are older and not what the deploy uses.

**`MASTER_KEY` is the whole system.** It opens the vault and every email
wallet. Keep a copy off the server; never commit it. The setup keeps a sealed
copy of the vault key in `VAULT_SEALED`, next to `MASTER_KEY`, so losing the
database can't lose the vault.

## Honest limits

- Custody: the vault is one wallet held by the signer. Per-basket accounting is
  in the database (`basket_holdings.vault_raw`); redemption is enforced by the
  service, not by a program. "Nobody can switch it off" needs an on-chain
  program — the upgrade path, once there is volume to justify its deploy cost.
- Baskets hold fixed weights. There is no rebalancing: it would spend SOL
  forever, against the cap.
- Failed legs are refunded automatically; an order a crash stopped
  mid-execution is parked for a manual look, not retried.
- Not audited. Keep `MAX_ORDER_USD` tiny until it is.

## Layout

```
migrations/      SQL, applied in order on boot
src/catalog.ts   what is listed + the curated baskets
src/chain/       rpc, jupiter, gecko, spl (mint / burn / transfer), sealed wallets
src/policy/      the limits as pure functions (+ tests)
src/signer/      the isolated signer and its client
src/services/    basket math, seeding, API shapes
src/routes/      REST
src/workers/     the background loop
tests/           npm test
```
