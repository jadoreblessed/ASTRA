"use client";

import { useEffect, useMemo, useState } from "react";

import { AssetLogo, LogoStack } from "@/components/common/asset-logo";
import { Spring } from "@/components/common/robot-spring";
import { Hover } from "@/components/common/touch-hover";
import { formatPrice, type Basket } from "@/data/mocks/app";
import { api, ApiError, confirmDeposit, pendingDeposits, type ApiDeposit, type ApiQuote } from "@/lib/astra-api";
import { payDeposit, provider } from "@/lib/wallet";
import { Press } from "@/components/ui/press";

import { AreaChart, Donut } from "./charts";
import { useAppData } from "./app-data";
import {
  Change,
  GLASS,
  PriceFlash,
  Reveal,
  Segmented,
  SlideToConfirm,
  useLive,
} from "./ui";

/**
 * A basket's page, after the reference app's: holdings as logo coins, the live
 * share price on a ranged chart, "what's inside" as a donut tied to the holdings
 * list (hover a row, its slice lifts), and the trade panel — buy, sell or redeem,
 * each confirmed with a full slide of the knob.
 *
 * With the backend up, the panel is live: every leg is quoted by Jupiter as you
 * type (route, price impact, price age), and the slide places a real order —
 * refused with the server's own words while trading is switched off.
 */

type Range = "7" | "30" | "90";
type Side = "buy" | "sell" | "redeem";

const HOVER = { tension: 320, friction: 22 } as const;

/** One distinct colour per holding, in the site's blue → lilac → pink family. */
const SLICE = ["#6d8bff", "#d2bdff", "#ff8fc4", "#7dd3fc", "#a5b4fc", "#f0abfc", "#93c5fd", "#c4b5fd"];

const DAY = 86_400_000;
const labelsFor = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.now() - (n - 1 - i) * DAY).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  );

const amountOf = (v: number, digits = 4) => (v >= 1 ? v.toLocaleString("en-US", { maximumFractionDigits: digits }) : v.toPrecision(4));

export interface BasketViewProps {
  basket: Basket;
  onBack: () => void;
  onLogin: () => void;
}

/** Places an order and follows it to the end, reporting each step as a short line. */
async function placeOrder(
  body: { basket: string; side: Side; amount: number; currency: "USDC" | "SOL" },
  custodial: boolean,
  note: (s: string) => void,
): Promise<void> {
  const { order, deposit } = await api<{ order: { id: string }; deposit: ApiDeposit }>("/api/orders", { body });
  if (custodial) {
    note("Paying from your ASTRA wallet…");
    await api(`/api/orders/${order.id}/pay`, { body: {}, timeoutMs: 60_000 });
  } else {
    const name = provider("Phantom") ? "Phantom" : "Solflare";
    note(`Approve the transfer in ${name}…`);
    const signature = await payDeposit(name, deposit);
    pendingDeposits.add(order.id, signature);
    note("Sent — waiting for the network…");
    await confirmDeposit(order.id, signature);
  }
  note("Paid — filling your order…");
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3_000));
    const { order: o } = await api<{ order: { status: string; error?: string } }>(`/api/orders/${order.id}`);
    if (o.status === "filled") return note("Filled. It's in your wallet.");
    if (o.status === "refunded") return note("Couldn't fill it right now — your payment was sent back.");
    if (o.status === "failed" || o.status === "refused") return note(o.error ?? "The order didn't go through.");
  }
  note("Still filling — check Wallet in a minute.");
}

export const BasketView = ({ basket, onBack, onLogin }: BasketViewProps) => {
  const { asset, live, user, config, refresh } = useAppData();
  const [range, setRange] = useState<Range>("30");
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState(live ? "1" : "100");
  const [currency, setCurrency] = useState<"USDC" | "SOL">("USDC");
  const [hovered, setHovered] = useState<string | null>(null);
  const [quote, setQuote] = useState<ApiQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [tradeNote, setTradeNote] = useState("Trading opens at the $ASTRA launch");
  // The slider only shows a note for a beat; an order's progress and outcome
  // stay readable under it until the next one.
  const [orderNote, setOrderNote] = useState<string | null>(null);
  const note = (s: string) => {
    setTradeNote(s);
    setOrderNote(s);
  };
  const ticking = useLive(basket.price);
  // Live data is the real price; the gentle tick is only for the offline demo.
  const price = live ? basket.price : ticking;

  const rows = useMemo(
    () =>
      basket.holdings.map((h, i) => ({
        ...h,
        asset: asset(h.symbol),
        color: SLICE[i % SLICE.length],
      })),
    [basket.holdings, asset],
  );

  const series = basket.history.slice(-Number(range));
  const labels = useMemo(() => labelsFor(series.length), [series.length]);

  const value = Number(amount) || 0;
  const solPrice = asset("SOL")?.price ?? 0;
  const usd = currency === "USDC" ? value : value * solPrice;
  const shares = side === "buy" ? usd / price : value;

  /* Live quote, debounced as you type. */
  useEffect(() => {
    if (!live || value <= 0) {
      setQuote(null);
      return;
    }
    let gone = false;
    const id = window.setTimeout(async () => {
      try {
        const q = await api<ApiQuote>("/api/quote", { body: { basket: basket.id, side, amount: value, currency } });
        if (!gone) {
          setQuote(q);
          setQuoteError(null);
        }
      } catch (err) {
        if (!gone) {
          setQuote(null);
          setQuoteError(err instanceof ApiError ? err.message : "Couldn't get a quote.");
        }
      }
    }, 450);
    return () => {
      gone = true;
      window.clearTimeout(id);
    };
  }, [live, basket.id, side, value, currency]);

  const confirm = async () => {
    if (!live) return setTradeNote("Trading opens at the $ASTRA launch");
    if (!user) {
      setTradeNote("Log in to trade");
      window.setTimeout(onLogin, 900);
      return;
    }
    try {
      note("Placing your order…");
      await placeOrder({ basket: basket.id, side, amount: value, currency }, user.custodial, note);
      await refresh();
    } catch (err) {
      note(err instanceof ApiError || err instanceof Error ? err.message : "The order didn't go through.");
    }
  };

  const impact = quote ? Math.max(0, ...quote.legs.map((l) => l.impactPct ?? 0)) : null;
  const route = quote?.legs.find((l) => l.route)?.route;

  const facts = [
    { label: "Value locked", value: basket.tvl },
    { label: "Holders", value: basket.holders.toLocaleString("en-US") },
    { label: "Created", value: basket.created },
    { label: "Rebalances", value: basket.rebalance },
  ];

  return (
    <div className="flex flex-col gap-[28px]">
      <Reveal>
        <Press mode="nudge-left">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-[8px] font-mulish text-[15px] text-white/60 hover:text-white"
          >
            <span aria-hidden="true">←</span> All baskets
          </button>
        </Press>
      </Reveal>

      {/* Header. */}
      <Reveal delay={60} className="flex flex-wrap items-end justify-between gap-[24px]">
        <div className="flex flex-col gap-[16px]">
          <LogoStack items={rows.map((r) => ({ symbol: r.symbol, logo: r.asset?.logo, mark: r.asset?.mark }))} size={44} max={7} />
          <div className="flex flex-wrap items-center gap-[14px]">
            <h1 className="m-0 font-mulish text-[clamp(36px,4.4vw,56px)] leading-none font-light text-white">
              {basket.name}
            </h1>
            <span className="rounded-full border border-white/[0.12] px-[12px] py-[7px] font-mono text-[14px] leading-none text-white/75">
              {basket.code}
            </span>
          </div>
          <p className="m-0 max-w-[560px] font-mulish text-[16px] leading-[1.5] text-white/60">{basket.description}</p>
        </div>
        <div className="flex flex-col items-end gap-[12px]">
          <span className="font-mono text-[clamp(34px,4vw,48px)] leading-none text-white">
            <PriceFlash value={price} up={price >= basket.price}>
              {formatPrice(price)}
            </PriceFlash>
          </span>
          <span className="flex items-center gap-[10px] font-mulish text-[14px] text-white/45">
            <Change value={basket.change} className="text-[16px]" /> 24h
          </span>
        </div>
      </Reveal>

      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)] items-start gap-[22px] max-pad-sm:grid-cols-1">
        <div className="flex flex-col gap-[22px]">
          {/* Chart. */}
          <Reveal delay={140} className={`${GLASS} p-[24px]`}>
            <div className="mb-[18px] flex items-center justify-between gap-[12px]">
              <span className="font-mulish text-[16px] text-white/70">Share price</span>
              <Segmented<Range>
                value={range}
                onChange={setRange}
                options={[
                  { value: "7", label: "1W" },
                  { value: "30", label: "1M" },
                  { value: "90", label: "3M" },
                ]}
              />
            </div>
            <AreaChart key={range} data={series} labels={labels} format={formatPrice} height={280} />
            <dl className="m-0 mt-[24px] grid grid-cols-4 gap-[16px] border-t border-white/[0.07] pt-[20px] max-hero-sm:grid-cols-2">
              {facts.map((f) => (
                <div key={f.label} className="flex flex-col-reverse gap-[8px]">
                  <dt className="font-mulish text-[13px] text-white/45">{f.label}</dt>
                  <dd className="m-0 font-mulish text-[16px] leading-tight text-white">{f.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>

          {/* What's inside. */}
          <Reveal delay={220} className={`${GLASS} p-[24px]`}>
            <div className="mb-[22px] flex items-baseline justify-between">
              <h2 className="m-0 font-mulish text-[22px] leading-none font-light text-white">What&rsquo;s inside</h2>
              <span className="font-mulish text-[14px] text-white/45">Redeemable for exactly this, any time</span>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-[32px] max-hero-sm:grid-cols-1 max-hero-sm:justify-items-center">
              <Donut
                segments={rows.map((r) => ({ key: r.symbol, value: r.weight, color: r.color }))}
                size={210}
                thickness={18}
                active={hovered}
              >
                <span className="font-mono text-[30px] leading-none text-white">{rows.length}</span>
                <span className="mt-[8px] font-mulish text-[14px] leading-none text-white/50">assets</span>
              </Donut>

              <ul className="m-0 flex w-full list-none flex-col gap-[4px] p-0">
                {rows.map((r, i) => (
                  <li
                    key={r.symbol}
                    onPointerEnter={() => setHovered(r.symbol)}
                    onPointerLeave={() => setHovered(null)}
                    className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[14px] rounded-[14px] px-[10px] py-[9px] ${hovered === r.symbol ? "bg-white/[0.06]" : ""}`}
                  >
                    <AssetLogo symbol={r.symbol} logo={r.asset?.logo} mark={r.asset?.mark} size={36} />
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-[8px]">
                        <span className="font-mulish text-[16px] text-white">{r.symbol}</span>
                        <span className="truncate font-mulish text-[13px] text-white/45">{r.asset?.name}</span>
                      </div>
                      <div className="mt-[7px] h-[4px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                        {/* Each weight bar grows in, one after the next. */}
                        <Spring
                          tag="span"
                          enabled
                          mode="once"
                          from={{ scaleX: 0 }}
                          to={{ scaleX: 1 }}
                          delayIn={420 + i * 90}
                          config={{ tension: 140, friction: 24 }}
                          className="block h-full origin-left rounded-full"
                          style={{ width: `${r.weight}%`, background: r.color }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-[6px]">
                      <span className="font-mono text-[16px] leading-none text-white">{r.weight}%</span>
                      {r.asset && <Change value={r.asset.change} className="text-[13px]" />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        {/* Trade panel. */}
        <Reveal delay={180} y={24} className={`${GLASS} sticky top-[96px] flex flex-col gap-[18px] p-[22px] max-pad-sm:static`}>
          <Segmented<Side>
            value={side}
            onChange={setSide}
            className="w-full justify-between"
            options={[
              { value: "buy", label: "Buy" },
              { value: "sell", label: "Sell" },
              { value: "redeem", label: "Redeem" },
            ]}
          />

          <label className="flex flex-col gap-[10px] rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-[16px]">
            <span className="flex items-center justify-between font-mulish text-[14px] text-white/50">
              {side === "buy" ? "You pay" : side === "sell" ? "You sell" : "You burn"}
              {side === "buy" && (
                <Segmented<"USDC" | "SOL">
                  value={currency}
                  onChange={setCurrency}
                  options={[
                    { value: "USDC", label: "USDC" },
                    { value: "SOL", label: "SOL" },
                  ]}
                />
              )}
            </span>
            <span className="flex items-center gap-[10px]">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-full bg-transparent font-mono text-[34px] leading-none text-white outline-none placeholder:text-white/25"
                placeholder="0"
                aria-label="Amount"
              />
              <span className="font-mulish text-[16px] text-white/60">
                {side === "buy" ? currency : basket.code}
              </span>
            </span>
          </label>

          {side === "buy" && (
            <div className="flex gap-[8px]">
              {/* While orders are capped (smoke-test phase) the chips stay inside the cap. */}
              {(live && config && config.maxOrderUsd < 25 ? ["1", "2", "5"] : ["25", "100", "500", "1000"]).map((v) => {
                const shown = currency === "USDC" ? v : solPrice > 0 ? (Number(v) / solPrice).toPrecision(2) : String(Number(v) / 100);
                return (
                  <Hover key={v} tag="div" from={{ scale: 1 }} to={{ scale: 1.06 }} config={HOVER} className="flex-1">
                    <button
                      type="button"
                      onClick={() => setAmount(shown)}
                      className={`w-full rounded-full border py-[9px] font-mulish text-[14px] ${amount === shown ? "border-accent-400/60 bg-accent-500/15 text-white" : "border-white/[0.1] bg-white/[0.03] text-white/65 hover:text-white"}`}
                    >
                      {currency === "USDC" ? `$${v}` : `${shown} SOL`}
                    </button>
                  </Hover>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-[12px] rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-[16px]">
            <span className="font-mulish text-[14px] text-white/50">You receive</span>
            {side === "redeem" ? (
              <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
                {rows.map((r) => {
                  const leg = quote?.legs.find((l) => l.symbol === r.symbol);
                  const units = leg?.out ?? (r.asset ? (value * price * r.weight) / 100 / r.asset.price : null);
                  return (
                    <li key={r.symbol} className="flex items-center justify-between gap-[10px]">
                      <span className="flex items-center gap-[10px] font-mulish text-[15px] text-white">
                        <AssetLogo symbol={r.symbol} logo={r.asset?.logo} mark={r.asset?.mark} size={24} />
                        {r.symbol}
                      </span>
                      <span className="font-mono text-[14px] text-white/80">{units === null ? "—" : amountOf(units, 6)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <span className="font-mono text-[26px] leading-none text-white">
                {side === "buy"
                  ? `${(quote?.shares ?? shares).toFixed(4)} ${basket.code}`
                  : quote?.proceeds !== undefined
                    ? `${amountOf(quote.proceeds)} ${currency}`
                    : `${formatPrice(value * price)}`}
              </span>
            )}
            {quoteError && <span className="font-mulish text-[13px] text-signal-ring">{quoteError}</span>}
          </div>

          <dl className="m-0 flex flex-col gap-[10px] font-mulish text-[14px]">
            {(quote
              ? [
                  ["Swaps", `${quote.swaps}, each limited to ${(quote.slippageBps / 100).toFixed(1)}%`],
                  ["Price impact", impact === null ? "—" : `${impact < 0.01 ? "<0.01" : impact.toFixed(2)}%`],
                  ["Route", route ?? "Direct"],
                  ["Price freshness", quote.priceAgeSec === null ? "—" : `${quote.priceAgeSec}s old${quote.fresh ? "" : " — too old to trade"}`],
                ]
              : [
                  ["Swaps", `${rows.length}, each price-limited`],
                  ["Approvals", "2"],
                  ["Price freshness", "Under 2 minutes"],
                  ["Network fee", "~0.0004 SOL"],
                ]
            ).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-[12px]">
                <dt className="text-white/50">{k}</dt>
                <dd className="m-0 text-white/85">{v}</dd>
              </div>
            ))}
          </dl>

          <SlideToConfirm
            label={side === "buy" ? `Slide to buy ${basket.code}` : side === "sell" ? `Slide to sell` : `Slide to redeem`}
            doneLabel={tradeNote}
            onConfirm={() => void confirm()}
          />
          {orderNote && (
            <p role="status" className="m-0 text-center font-mulish text-[14px] leading-[1.45] break-words text-white/80">
              {orderNote}
            </p>
          )}
          {live && config && !config.trading && (
            <p className="m-0 text-center font-mulish text-[13px] leading-[1.4] text-white/45">
              Quotes are live from Jupiter. Orders open at the $ASTRA launch.
            </p>
          )}
        </Reveal>
      </div>
    </div>
  );
};
