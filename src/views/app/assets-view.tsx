"use client";

import { useEffect, useMemo, useState } from "react";
import { animated, useTrail } from "@react-spring/web";

import { AssetLogo } from "@/components/common/asset-logo";
import { formatPrice, type AppContent, type Asset, type AssetKind } from "@/data/mocks/app";

import { Change, GLASS, PriceFlash, Reveal, Segmented } from "./ui";
import { useAppData } from "./app-data";

/**
 * Assets — every token a basket can hold, after the reference app's table: logo,
 * ticker and name, a live price that flashes as it moves, 24h change, market cap,
 * volume, holders and how many baskets hold it. Filter by class, search by name
 * or ticker.
 */

type Filter = "all" | AssetKind;

/** Live prices: every couple of seconds a few assets move by a few bps. */
const useLivePrices = (assets: Asset[]) => {
  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(assets.map((a) => [a.symbol, a.price])),
  );
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setPrices((p) => {
        const next = { ...p };
        for (let k = 0; k < 4; k++) {
          const a = assets[Math.floor(Math.random() * assets.length)];
          next[a.symbol] = next[a.symbol] * (1 + (Math.random() - 0.48) * 0.004);
        }
        return next;
      });
    }, 1600);
    return () => window.clearInterval(id);
  }, [assets]);
  return prices;
};

export interface AssetsViewProps {
  content: AppContent;
  query: string;
  onQuery: (q: string) => void;
}

export const AssetsView = ({ content, query, onQuery }: AssetsViewProps) => {
  const { live } = useAppData();
  const tvl = content.stats.find((s) => s.label === "Value locked");
  const held = tvl ? `${tvl.prefix}${tvl.value}${tvl.suffix}` : "$0";
  const [filter, setFilter] = useState<Filter>("all");
  const ticking = useLivePrices(content.assets);
  // Live data is the real price (refreshed every 30s); the tick is only the offline demo.
  const prices = useMemo(
    () => (live ? Object.fromEntries(content.assets.map((a) => [a.symbol, a.price])) : ticking),
    [live, content.assets, ticking],
  );

  const count = (k: AssetKind) => content.assets.filter((a) => a.kind === k).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return content.assets.filter(
      (a) =>
        (filter === "all" || a.kind === filter) &&
        (!q || a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)),
    );
  }, [content.assets, filter, query]);

  /* Rows stream in top to bottom; the trail restarts when the filter changes. */
  const [trail, trailApi] = useTrail(rows.length, () => ({ o: 0, y: 14, config: { tension: 300, friction: 28 } }));
  useEffect(() => {
    trailApi.set({ o: 0, y: 14 });
    trailApi.start({ o: 1, y: 0, delay: 180 });
  }, [filter, query, rows.length, trailApi]);

  return (
    <div className="flex flex-col gap-[32px]">
      <Reveal className="flex flex-wrap items-end justify-between gap-[24px]">
        <div className="flex flex-col gap-[14px]">
          <h1 className="m-0 font-mulish text-[clamp(38px,4.6vw,58px)] leading-none font-light text-white">Assets</h1>
          <p className="m-0 max-w-[560px] font-mulish text-[16px] leading-[1.5] text-white/60">
            Every token a basket can hold — stocks, crypto and memecoins. Up to 14 in a basket, any mix.
          </p>
        </div>
        <dl className="m-0 flex gap-[40px]">
          {[
            ["Listed", live ? String(content.assets.length) : "133"],
            ["Held in baskets", live ? held : "$2.41M"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col-reverse gap-[10px] text-right max-pad-sm:text-left">
              <dt className="font-mulish text-[14px] text-white/50">{k}</dt>
              <dd className="m-0 font-mono text-[32px] leading-none text-white">{v}</dd>
            </div>
          ))}
        </dl>
      </Reveal>

      <Reveal delay={90} className="flex flex-wrap items-center justify-between gap-[14px]">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: content.assets.length },
            { value: "stock", label: "Stocks", count: count("stock") },
            { value: "crypto", label: "Crypto", count: count("crypto") },
            { value: "meme", label: "Memecoins", count: count("meme") },
          ]}
        />
        <label className="flex h-[44px] w-[280px] items-center gap-[10px] rounded-full border border-white/[0.1] bg-white/[0.04] px-[16px] max-hero-sm:w-full">
          <svg viewBox="0 0 24 24" className="size-[16px] text-white/45" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search by name or ticker"
            aria-label="Search assets"
            className="w-full bg-transparent font-mulish text-[15px] text-white outline-none placeholder:text-white/35"
          />
        </label>
      </Reveal>

      <Reveal delay={160} className={`${GLASS} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse font-mulish">
            <thead>
              <tr className="border-b border-white/[0.07] text-left text-[13px] text-white/45">
                <th className="py-[16px] pr-[12px] pl-[24px] font-normal">Asset</th>
                <th className="px-[12px] py-[16px] text-right font-normal">Price</th>
                <th className="px-[12px] py-[16px] text-right font-normal">24h</th>
                <th className="px-[12px] py-[16px] text-right font-normal">Market cap</th>
                <th className="px-[12px] py-[16px] text-right font-normal">Volume 24h</th>
                <th className="px-[12px] py-[16px] text-right font-normal">Holders</th>
                <th className="py-[16px] pr-[24px] pl-[12px] text-right font-normal">In baskets</th>
              </tr>
            </thead>
            <tbody key={`${filter}:${query}`}>
              {rows.map((a, i) => {
                const p = prices[a.symbol] ?? a.price;
                const t = trail[i];
                return (
                  <animated.tr
                    key={a.symbol}
                    className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.035]"
                    style={t ? { opacity: t.o, transform: t.y.to((v) => `translateY(${v.toFixed(1)}px)`) } : undefined}
                  >
                    <td className="py-[14px] pr-[12px] pl-[24px]">
                      <span className="flex items-center gap-[14px]">
                        <AssetLogo symbol={a.symbol} logo={a.logo} mark={a.mark} size={38} />
                        <span className="flex flex-col gap-[5px]">
                          <span className="flex items-center gap-[8px] text-[16px] leading-none text-white">
                            {a.symbol}
                            <span
                              className="size-[7px] rounded-full"
                              style={{ background: content.kinds[a.kind].color }}
                              title={content.kinds[a.kind].label}
                            />
                          </span>
                          <span className="text-[13px] leading-none text-white/45">{a.name}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-[12px] py-[14px] text-right font-mono text-[15px] text-white">
                      <PriceFlash value={p} up={p >= a.price}>
                        {formatPrice(p)}
                      </PriceFlash>
                    </td>
                    <td className="px-[12px] py-[14px] text-right">
                      <Change value={a.change} className="text-[14px]" />
                    </td>
                    <td className="px-[12px] py-[14px] text-right font-mono text-[14px] text-white/80">{a.mcap}</td>
                    <td className="px-[12px] py-[14px] text-right font-mono text-[14px] text-white/80">{a.volume}</td>
                    <td className="px-[12px] py-[14px] text-right font-mono text-[14px] text-white/80">
                      {a.holders.toLocaleString("en-US")}
                    </td>
                    <td className="py-[14px] pr-[24px] pl-[12px] text-right font-mono text-[14px] text-white/80">
                      {a.baskets}
                    </td>
                  </animated.tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-[40px] text-center text-[15px] text-white/50">
                    Nothing listed matches &ldquo;{query}&rdquo;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Reveal>
    </div>
  );
};
