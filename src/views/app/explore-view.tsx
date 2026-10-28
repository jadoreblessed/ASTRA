"use client";

import { useMemo, useState } from "react";

import { AnimatedHeading } from "@/components/animation/animated-heading";
import { LogoStack } from "@/components/common/asset-logo";
import { RollingNumber } from "@/components/common/rolling-number";
import { Hover } from "@/components/common/touch-hover";
import { FancyButton } from "@/components/ui/fancy-button";
import { AstraMark } from "@/components/ui/astra-mark";
import {
  formatPrice,
  type Asset,
  type AppContent,
  type Basket,
} from "@/data/mocks/app";

import { AreaChart, Sparkline } from "./charts";
import { useAppData } from "./app-data";
import { Change, GLASS, PriceFlash, Reveal, Segmented, useLive } from "./ui";

/**
 * Explore — the app's front page, after the reference app's: a masthead in the
 * hero's mirrored gradient, live protocol stats, today's top basket on a chart,
 * the $ASTRA bar, then every basket as a card — its holdings as overlapping logo
 * coins, a sparkline, and a composition bar split by asset class.
 */

type Sort = "top" | "gainers" | "new";

const HOVER = { tension: 320, friction: 22 } as const;

type Lookup = (symbol: string) => Asset | undefined;

const logosOf = (b: Basket, assetOf: Lookup) =>
  b.holdings.map((h) => {
    const a = assetOf(h.symbol);
    return { symbol: h.symbol, logo: a?.logo, mark: a?.mark };
  });

/** Weight per asset class — the coloured bar on each card. */
const mixOf = (b: Basket, kinds: AppContent["kinds"], assetOf: Lookup) => {
  const totals: Record<string, number> = {};
  for (const h of b.holdings) {
    const kind = assetOf(h.symbol)?.kind ?? "stock";
    totals[kind] = (totals[kind] ?? 0) + h.weight;
  }
  return (Object.keys(kinds) as (keyof typeof kinds)[])
    .filter((k) => totals[k])
    .map((k) => ({ kind: k, weight: totals[k], color: kinds[k].color }));
};

const BasketCard = ({
  basket,
  kinds,
  index,
  onOpen,
}: {
  basket: Basket;
  kinds: AppContent["kinds"];
  index: number;
  onOpen: (id: string) => void;
}) => {
  const { asset, live } = useAppData();
  const ticking = useLive(basket.price);
  const price = live ? basket.price : ticking;
  const mix = mixOf(basket, kinds, asset);
  return (
    <Reveal tag="li" delay={160 + index * 70}>
      <Hover tag="div" from={{ y: 0 }} to={{ y: -6 }} config={HOVER} className="h-full">
        <button
          type="button"
          onClick={() => onOpen(basket.id)}
          className={`${GLASS} group flex h-full w-full flex-col gap-[20px] p-[22px] text-left hover:border-white/[0.18]`}
        >
          <div className="flex items-center justify-between gap-[12px]">
            <LogoStack items={logosOf(basket, asset)} size={34} max={5} />
            <span className="rounded-full border border-white/[0.1] px-[11px] py-[6px] font-mono text-[13px] leading-none text-white/70">
              {basket.code}
            </span>
          </div>

          <div>
            <h3 className="m-0 font-mulish text-[22px] leading-tight font-normal text-white">
              {basket.name}
            </h3>
            <p className="m-0 mt-[6px] line-clamp-2 font-mulish text-[14px] leading-[1.45] text-white/55">
              {basket.description}
            </p>
          </div>

          <div className="flex items-end justify-between gap-[12px]">
            <div className="flex flex-col gap-[8px]">
              <span className="font-mono text-[24px] leading-none text-white">
                <PriceFlash value={price} up={price >= basket.price}>
                  {formatPrice(price)}
                </PriceFlash>
              </span>
              <Change value={basket.change} className="text-[14px]" />
            </div>
            <Sparkline data={basket.history.slice(-40)} width={128} height={44} delay={300 + index * 70} />
          </div>

          <div className="flex h-[6px] w-full gap-[3px] overflow-hidden rounded-full">
            {mix.map((m) => (
              <span
                key={m.kind}
                className="h-full rounded-full"
                style={{ width: `${m.weight}%`, background: m.color }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between font-mulish text-[13px] text-white/50">
            <span>
              <span className="text-white/80">{basket.holders.toLocaleString("en-US")}</span> holders
            </span>
            <span>
              TVL <span className="text-white/80">{basket.tvl}</span>
            </span>
          </div>
        </button>
      </Hover>
    </Reveal>
  );
};

export interface ExploreViewProps {
  content: AppContent;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onAssets: () => void;
}

export const ExploreView = ({ content, onOpen, onCreate, onAssets }: ExploreViewProps) => {
  const { asset, live } = useAppData();
  const [sort, setSort] = useState<Sort>("top");
  const [ready] = useState(true);

  const baskets = useMemo(() => {
    const list = content.baskets.slice();
    if (sort === "gainers") list.sort((a, b) => b.change - a.change);
    else if (sort === "new") list.reverse();
    else list.sort((a, b) => b.holders - a.holders);
    return list;
  }, [content.baskets, sort]);

  const top = useMemo(
    () => content.baskets.slice().sort((a, b) => b.change - a.change)[0],
    [content.baskets],
  );
  const topTicking = useLive(top.price);
  const topPrice = live ? top.price : topTicking;
  const days = useMemo(
    () =>
      top.history.slice(-30).map((_, i, arr) => {
        const d = new Date(2026, 9, 27 - (arr.length - 1 - i));
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }),
    [top.history],
  );

  return (
    <div className="flex flex-col gap-[56px]">
      {/* Masthead + today's top basket. */}
      <section className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-center gap-[48px] max-pad-sm:grid-cols-1">
        <div className="flex flex-col gap-[26px]">
          <AnimatedHeading
            tag="h1"
            enabled={ready}
            baseDelay={80}
            stagger={28}
            className="m-0 font-mulish text-[clamp(40px,5.2vw,68px)] leading-[1.02] font-light"
            lines={[
              { text: content.title.top, opaque: "left" },
              { text: content.title.bottom, opaque: "right" },
            ]}
          />
          <Reveal delay={260}>
            <p className="m-0 max-w-[520px] font-mulish text-[17px] leading-[1.55] text-white/65">
              {content.subtitle}
            </p>
          </Reveal>
          <Reveal delay={340}>
            <dl className="m-0 flex flex-wrap gap-x-[44px] gap-y-[18px]">
              {content.stats.map((s) => (
                <div key={s.label} className="flex flex-col-reverse gap-[10px]">
                  <dt className="font-mulish text-[14px] leading-none text-white/50">{s.label}</dt>
                  <dd className="m-0 flex items-baseline font-mono text-[32px] leading-none text-white">
                    {s.prefix}
                    <RollingNumber value={s.value} enabled delay={500} />
                    {s.suffix}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
          <Reveal delay={420} className="flex flex-wrap gap-[12px]">
            <FancyButton onClick={onCreate}>
              Create a basket
            </FancyButton>
            <FancyButton variant="ghost" onClick={onAssets}>
              Browse {content.assets.length} assets
            </FancyButton>
          </Reveal>
        </div>

        <Reveal delay={200} y={26}>
          <button
            type="button"
            onClick={() => onOpen(top.id)}
            className={`${GLASS} block w-full p-[26px] text-left hover:border-white/[0.18]`}
          >
            <div className="flex items-start justify-between gap-[16px]">
              <div className="flex flex-col gap-[12px]">
                <span className="font-mulish text-[14px] leading-none text-white/50">Top today</span>
                <span className="font-mulish text-[26px] leading-none text-white">{top.name}</span>
                <LogoStack items={logosOf(top, asset)} size={30} max={6} />
              </div>
              <div className="flex flex-col items-end gap-[10px]">
                <span className="font-mono text-[30px] leading-none text-white">
                  <PriceFlash value={topPrice} up={topPrice >= top.price}>
                    {formatPrice(topPrice)}
                  </PriceFlash>
                </span>
                <Change value={top.change} className="text-[16px]" />
              </div>
            </div>
            <div className="mt-[28px]">
              <AreaChart data={top.history.slice(-30)} labels={days} format={formatPrice} height={210} />
            </div>
          </button>
        </Reveal>
      </section>

      {/* The $ASTRA bar. */}
      <Reveal delay={480}>
        <section
          className={`${GLASS} flex flex-wrap items-center justify-between gap-[18px] px-[26px] py-[20px]`}
          aria-label={`${content.token.symbol} token`}
        >
          <div className="flex items-center gap-[18px]">
            <AstraMark size={40} />
            <span className="font-mulish text-[28px] leading-none font-light text-white">
              {content.token.symbol}
            </span>
            <span className="font-mulish text-[15px] leading-none text-white/50">{content.token.note}</span>
          </div>
          <div className="flex flex-wrap items-center gap-[10px]">
            <span className="flex h-[46px] items-center gap-[12px] rounded-full border border-white/[0.08] bg-white/[0.04] px-[18px]">
              <span className="size-[7px] rounded-full bg-signal-glow" />
              <span className="font-mulish text-[14px] tracking-[0.1em] text-accent-300">{content.token.caLabel}</span>
              <span aria-hidden="true" className="h-[16px] w-px bg-white/15" />
              <span className="font-mulish text-[15px] text-white/85">{content.token.ca}</span>
            </span>
            <FancyButton variant="primary">
              Buy at launch
            </FancyButton>
          </div>
        </section>
      </Reveal>

      {/* All baskets. */}
      <section className="flex flex-col gap-[24px]">
        <Reveal delay={120} className="flex flex-wrap items-end justify-between gap-[18px]">
          <div className="flex flex-col gap-[12px]">
            <h2 className="m-0 font-mulish text-[32px] leading-none font-light text-white">All baskets</h2>
            <div className="flex flex-wrap gap-[18px] font-mulish text-[14px] text-white/55">
              {Object.values(content.kinds).map((k) => (
                <span key={k.label} className="inline-flex items-center gap-[8px]">
                  <span className="size-[8px] rounded-full" style={{ background: k.color }} />
                  {k.label}
                </span>
              ))}
            </div>
          </div>
          <Segmented<Sort>
            value={sort}
            onChange={setSort}
            options={[
              { value: "top", label: "Most held" },
              { value: "gainers", label: "Top gainers" },
              { value: "new", label: "Newest" },
            ]}
          />
        </Reveal>

        <ul key={sort} className="m-0 grid list-none grid-cols-3 gap-[18px] p-0 max-pad-md:grid-cols-2 max-hero-sm:grid-cols-1">
          {baskets.map((b, i) => (
            <BasketCard key={b.id} basket={b} kinds={content.kinds} index={i} onOpen={onOpen} />
          ))}
        </ul>
      </section>
    </div>
  );
};
