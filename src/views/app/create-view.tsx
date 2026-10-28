"use client";

import { useMemo, useState } from "react";

import { AssetLogo } from "@/components/common/asset-logo";
import { Hover } from "@/components/common/touch-hover";
import type { AppContent, AssetKind } from "@/data/mocks/app";
import { FancyButton } from "@/components/ui/fancy-button";
import { api, ApiError } from "@/lib/astra-api";
import type { Basket } from "@/data/mocks/app";

import { Donut } from "./charts";
import { useAppData } from "./app-data";
import { Change, GLASS, Reveal, Segmented } from "./ui";

/**
 * Create — the basket builder, after the reference app's: pick up to 14 assets,
 * set their weights, choose how it rebalances and who can buy it, and see the
 * $ASTRA it burns. The donut redraws as the weights move. Creating saves it on
 * the backend — its own ticker, page and live chart from that moment; its share
 * token is minted on chain with its first buy.
 */

const REBALANCE: Record<"7d" | "30d" | "drift", string> = {
  "7d": "Every 7 days",
  "30d": "Every 30 days",
  drift: "At 5% drift",
};

const MAX = 14;
const BURN_PER_ASSET = 10_000;
const SLICE = ["#6d8bff", "#d2bdff", "#ff8fc4", "#7dd3fc", "#a5b4fc", "#f0abfc", "#93c5fd", "#c4b5fd"];
const HOVER = { tension: 320, friction: 22 } as const;

type Filter = "all" | AssetKind;
type Rebalance = "7d" | "30d" | "drift";
type Access = "public" | "allowlist" | "private";

export interface CreateViewProps {
  content: AppContent;
  onCreated: (id: string) => void;
  onLogin: () => void;
}

export const CreateView = ({ content, onCreated, onLogin }: CreateViewProps) => {
  const { asset, live, user, addBasket } = useAppData();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [name, setName] = useState("My basket");
  const [weights, setWeights] = useState<Record<string, number>>({
    NVDAx: 40,
    SPYx: 30,
    SOL: 20,
    BONK: 10,
  });
  const [rebalance, setRebalance] = useState<Rebalance>("30d");
  const [access, setAccess] = useState<Access>("public");

  const picked = Object.keys(weights);
  const total = picked.reduce((s, k) => s + weights[k], 0) || 1;

  const list = useMemo(
    () => content.assets.filter((a) => filter === "all" || a.kind === filter),
    [content.assets, filter],
  );

  const toggle = (symbol: string) =>
    setWeights((w) => {
      if (w[symbol] !== undefined) {
        const next = { ...w };
        delete next[symbol];
        return next;
      }
      if (Object.keys(w).length >= MAX) return w;
      return { ...w, [symbol]: 10 };
    });

  const code = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase().padEnd(2, "X") || "MINE";

  const create = async () => {
    if (!live) return setNote("Can't reach ASTRA right now — try again in a moment.");
    if (!user) {
      setNote("Log in to create a basket.");
      window.setTimeout(onLogin, 900);
      return;
    }
    setBusy(true);
    try {
      const { basket } = await api<{ basket: Basket }>("/api/baskets", {
        body: {
          name,
          code,
          rebalance: REBALANCE[rebalance],
          access: access === "public" ? "public" : "private",
          weights: picked.map((symbol) => ({ symbol, weight: weights[symbol] })),
        },
      });
      addBasket(basket);
      onCreated(basket.id);
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Couldn't create it.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-[32px]">
      <Reveal className="flex flex-col gap-[14px]">
        <h1 className="m-0 font-mulish text-[clamp(38px,4.6vw,58px)] leading-none font-light text-white">
          Build a basket
        </h1>
        <p className="m-0 max-w-[620px] font-mulish text-[16px] leading-[1.5] text-white/60">
          Pick up to 14 of {live ? content.assets.length : 133} listed assets, set the weights and how it rebalances. It gets its own
          token, its own page and its own live chart.
        </p>
      </Reveal>

      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)] items-start gap-[22px] max-pad-sm:grid-cols-1">
        {/* Picker. */}
        <Reveal delay={90} className={`${GLASS} flex flex-col gap-[18px] p-[22px]`}>
          <div className="flex flex-wrap items-center justify-between gap-[12px]">
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "stock", label: "Stocks" },
                { value: "crypto", label: "Crypto" },
                { value: "meme", label: "Memecoins" },
              ]}
            />
            <span className="font-mulish text-[14px] text-white/50">
              <span className="text-white">{picked.length}</span> of {MAX} picked
            </span>
          </div>

          <ul className="m-0 grid list-none grid-cols-3 gap-[10px] p-0 max-hero-md:grid-cols-2">
            {list.map((a) => {
              const on = weights[a.symbol] !== undefined;
              return (
                <li key={a.symbol}>
                  <Hover tag="div" from={{ y: 0 }} to={{ y: -3 }} config={HOVER}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(a.symbol)}
                      className={`flex w-full items-center gap-[12px] rounded-[16px] border p-[12px] text-left ${on ? "border-accent-400/55 bg-accent-500/[0.12]" : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.16]"}`}
                    >
                      <AssetLogo symbol={a.symbol} logo={a.logo} mark={a.mark} size={36} />
                      <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
                        <span className="font-mulish text-[15px] leading-none text-white">{a.symbol}</span>
                        <span className="truncate font-mulish text-[13px] leading-none text-white/45">{a.name}</span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`flex size-[22px] shrink-0 items-center justify-center rounded-full border ${on ? "border-transparent bg-white" : "border-white/20"}`}
                      >
                        {on && (
                          <svg viewBox="0 0 24 24" className="size-[14px]" fill="none">
                            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#05060F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                    </button>
                  </Hover>
                </li>
              );
            })}
          </ul>
        </Reveal>

        {/* Your basket. */}
        <Reveal delay={160} y={24} className={`${GLASS} sticky top-[96px] flex flex-col gap-[20px] p-[22px] max-pad-sm:static`}>
          <div className="flex items-center justify-between gap-[12px]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Basket name"
              className="w-full bg-transparent font-mulish text-[24px] leading-none font-light text-white outline-none"
            />
            <span className="rounded-full border border-white/[0.12] px-[12px] py-[7px] font-mono text-[14px] leading-none text-white/75">
              {code}
            </span>
          </div>

          <div className="flex justify-center">
            <Donut
              key={picked.join("-")}
              segments={picked.map((s, i) => ({ key: s, value: weights[s], color: SLICE[i % SLICE.length] }))}
              size={180}
              thickness={16}
            >
              <span className="font-mono text-[28px] leading-none text-white">{picked.length}</span>
              <span className="mt-[8px] font-mulish text-[14px] leading-none text-white/50">assets</span>
            </Donut>
          </div>

          <ul className="m-0 flex list-none flex-col gap-[14px] p-0">
            {picked.map((s, i) => {
              const a = asset(s);
              const pct = Math.round((weights[s] / total) * 100);
              return (
                <li key={s} className="flex flex-col gap-[9px]">
                  <div className="flex items-center justify-between gap-[10px]">
                    <span className="flex items-center gap-[10px] font-mulish text-[15px] text-white">
                      <AssetLogo symbol={s} logo={a?.logo} mark={a?.mark} size={26} />
                      {s}
                      {a && <Change value={a.change} className="text-[12px]" />}
                    </span>
                    <span className="flex items-center gap-[12px]">
                      <span className="font-mono text-[15px] text-white">{pct}%</span>
                      <button
                        type="button"
                        onClick={() => toggle(s)}
                        aria-label={`Remove ${s}`}
                        className="text-[18px] leading-none text-white/40 hover:text-white"
                      >
                        ×
                      </button>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={weights[s]}
                    onChange={(e) => setWeights((w) => ({ ...w, [s]: Number(e.target.value) }))}
                    aria-label={`${s} weight`}
                    className="h-[4px] w-full cursor-pointer"
                    style={{ accentColor: SLICE[i % SLICE.length] }}
                  />
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-[12px] border-t border-white/[0.07] pt-[18px]">
            <span className="font-mulish text-[14px] text-white/50">Rebalances</span>
            <Segmented<Rebalance>
              value={rebalance}
              onChange={setRebalance}
              options={[
                { value: "7d", label: "Weekly" },
                { value: "30d", label: "Monthly" },
                { value: "drift", label: "At 5% drift" },
              ]}
            />
            <span className="mt-[4px] font-mulish text-[14px] text-white/50">Who can buy it</span>
            <Segmented<Access>
              value={access}
              onChange={setAccess}
              options={[
                { value: "public", label: "Everyone" },
                { value: "allowlist", label: "Allowlist" },
                { value: "private", label: "Only me" },
              ]}
            />
          </div>

          <div className="flex items-center justify-between rounded-[16px] border border-signal-ring/25 bg-signal-glow/[0.07] px-[16px] py-[14px] font-mulish text-[14px]">
            <span className="text-white/70">$ASTRA burned at creation</span>
            <span className="font-mono text-[16px] text-signal-ring">
              {(picked.length * BURN_PER_ASSET).toLocaleString("en-US")}
            </span>
          </div>

          <FancyButton size="lg" full onClick={() => void create()}>
            {busy ? "Creating…" : `Create $${code}`}
          </FancyButton>
          {note && (
            <p className="m-0 text-center font-mulish text-[14px] text-accent-300" role="status">
              {note}
            </p>
          )}
        </Reveal>
      </div>
    </div>
  );
};
