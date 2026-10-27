"use client";

import { useEffect, useState } from "react";

import { Spring } from "@/components/common/robot-spring";
import { Hover } from "@/components/common/touch-hover";
import type { AppContent, Basket } from "@/data/mocks/app";

/**
 * The product console — pick a basket on the left, hold it as one token on the
 * right. Mock UI: selecting a basket is local state; "Buy" and "Redeem" are
 * inert. Entrances use the project's spring engine (hard rule #1), armed once on
 * mount and staggered by `delayIn`.
 */

const REVEAL = { tension: 210, friction: 26 } as const;
const HOVER = { tension: 320, friction: 22 } as const;

/** The orbit mark, inline so the console carries the brand without an asset. */
const OrbitMark = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true" className="shrink-0">
    <circle cx="12" cy="12" r="9" stroke="#9fb8ff" strokeWidth="1.4" />
    <circle cx="12" cy="12" r="5" stroke="#ff8fc4" strokeWidth="1.4" />
  </svg>
);

export interface AppConsoleProps {
  content: AppContent;
}

export const AppConsole = ({ content }: AppConsoleProps) => {
  const { eyebrow, heading, baskets } = content;
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState(baskets[0]?.id ?? "");
  useEffect(() => setReady(true), []);

  const selected =
    baskets.find((b) => b.id === selectedId) ?? baskets[0];
  const isBuild = selected.holdings.length === 0;

  return (
    <div className="grid grid-cols-1 gap-[20px] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-[28px]">
      {/* Basket picker. */}
      <section aria-label="Baskets">
        <Spring
          tag="div"
          enabled={ready}
          from={{ opacity: 0, y: 14, filter: "blur(6px)" }}
          to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          delayIn={80}
          config={REVEAL}
        >
          <p className="font-mulish text-[13px] tracking-[0.2em] text-accent-300 uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-[8px] font-mulish text-[30px] leading-[1.05] font-light text-white sm:text-[38px]">
            {heading}
          </h1>
        </Spring>

        <ul className="mt-[22px] flex flex-col gap-[12px]">
          {baskets.map((basket, i) => (
            <Spring
              tag="li"
              key={basket.id}
              enabled={ready}
              from={{ opacity: 0, y: 16, filter: "blur(6px)" }}
              to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              delayIn={160 + i * 70}
              config={REVEAL}
            >
              <Hover tag="div" from={{ scale: 1 }} to={{ scale: 1.012 }} config={HOVER}>
                <BasketRow
                  basket={basket}
                  active={basket.id === selected.id}
                  onSelect={() => setSelectedId(basket.id)}
                />
              </Hover>
            </Spring>
          ))}
        </ul>
      </section>

      {/* Holding panel. */}
      <Spring
        tag="aside"
        enabled={ready}
        from={{ opacity: 0, y: 18, filter: "blur(8px)" }}
        to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        delayIn={220}
        config={REVEAL}
        className="self-start overflow-hidden rounded-[26px] border border-[color:var(--hero-glass-border)] bg-[var(--hero-glass)] backdrop-blur-[10px] lg:sticky lg:top-[96px]"
      >
        <div className="flex items-center justify-between gap-[12px] px-[24px] pt-[24px]">
          <div className="flex items-center gap-[12px]">
            <OrbitMark size={26} />
            <div>
              <p className="font-mulish text-[18px] leading-none font-normal text-white">
                {selected.name}
              </p>
              <p className="mt-[5px] font-mulish text-[13px] text-white/45">
                {selected.subtitle}
              </p>
            </div>
          </div>
          {selected.change && (
            <span className="rounded-full border border-signal-ring/30 bg-signal-glow/10 px-[11px] py-[5px] font-mulish text-[13px] text-signal-ring">
              {selected.change}
            </span>
          )}
        </div>

        <div className="mt-[22px] px-[24px]">
          {isBuild ? (
            <BuildYourOwn />
          ) : (
            <ul className="flex flex-col gap-[14px]">
              {selected.holdings.map((h) => (
                <li key={h.symbol} className="flex items-center gap-[14px]">
                  <span className="w-[66px] shrink-0 font-mulish text-[15px] text-white">
                    {h.symbol}
                  </span>
                  <span className="hidden w-[84px] shrink-0 font-mulish text-[13px] text-white/40 sm:block">
                    {h.name}
                  </span>
                  <span className="relative h-[6px] flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${h.weight}%`,
                        backgroundImage:
                          "linear-gradient(90deg, var(--accent-500), var(--accent-300))",
                      }}
                    />
                  </span>
                  <span className="w-[42px] shrink-0 text-right font-mulish text-[14px] text-white/70">
                    {h.weight}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Summary + actions. */}
        <div className="mt-[24px] border-t border-white/[0.08] px-[24px] py-[22px]">
          <div className="flex items-end justify-between gap-[12px]">
            <div>
              <p className="font-mulish text-[13px] tracking-[0.14em] text-white/45 uppercase">
                You hold
              </p>
              <p className="mt-[8px] font-mulish text-[32px] leading-none font-light text-white">
                1.00 <span className="text-accent-300">$ASTRA</span>
              </p>
            </div>
            <div className="text-right">
              <p className="font-mulish text-[22px] leading-none font-normal text-white">
                {selected.price}
              </p>
              <span className="mt-[8px] inline-block rounded-full bg-signal-glow/12 px-[10px] py-[4px] font-mulish text-[12px] text-signal-ring">
                100% redeemable
              </span>
            </div>
          </div>

          <div className="mt-[20px] flex items-center gap-[10px]">
            <Hover tag="div" from={{ scale: 1 }} to={{ scale: 1.03 }} config={HOVER} className="flex-1">
              <a
                href="#"
                className="flex w-full items-center justify-center gap-[9px] rounded-[50px] py-[14px] font-mulish text-[16px] text-white"
                style={{ backgroundImage: "var(--gradient-hero-cta)" }}
                aria-disabled="true"
              >
                {isBuild ? "Choose assets" : "Buy basket"}
              </a>
            </Hover>
            <Hover tag="div" from={{ scale: 1 }} to={{ scale: 1.03 }} config={HOVER}>
              <a
                href="#"
                className="flex items-center justify-center rounded-[50px] border border-[color:var(--hero-glass-border)] px-[22px] py-[14px] font-mulish text-[16px] text-white hover:bg-white/[0.06]"
                aria-disabled="true"
              >
                Redeem
              </a>
            </Hover>
          </div>
        </div>
      </Spring>
    </div>
  );
};

/* ------------------------------------------------------------------- pieces */

const BasketRow = ({
  basket,
  active,
  onSelect,
}: {
  basket: Basket;
  active: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    aria-pressed={active}
    className={`flex w-full items-center gap-[16px] rounded-[20px] border px-[20px] py-[17px] text-left ${
      active
        ? "border-signal-ring/40 bg-white/[0.05]"
        : "border-[color:var(--hero-glass-border)] bg-[var(--hero-glass)] hover:bg-white/[0.04]"
    }`}
  >
    <span
      className={`font-mulish text-[15px] tabular-nums ${active ? "text-signal-ring" : "text-accent-300"}`}
    >
      {basket.number}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block font-mulish text-[17px] leading-tight text-white">
        {basket.name}
      </span>
      <span className="mt-[3px] block truncate font-mulish text-[13px] text-white/40">
        {basket.subtitle}
      </span>
    </span>
    <span className="shrink-0 text-right">
      <span className="block font-mulish text-[15px] text-white">{basket.price}</span>
      {basket.change && (
        <span className="mt-[3px] block font-mulish text-[12px] text-accent-300">
          {basket.change}
        </span>
      )}
    </span>
  </button>
);

const BuildYourOwn = () => (
  <div className="flex flex-col items-center gap-[10px] rounded-[18px] border border-dashed border-white/[0.14] px-[20px] py-[30px] text-center">
    <OrbitMark size={28} />
    <p className="font-mulish text-[15px] text-white">Start from zero</p>
    <p className="max-w-[260px] font-mulish text-[13px] leading-[1.5] text-white/45">
      Pick up to 14 of 133 stocks, cryptos and memecoins and set your own
      weights — then hold the lot as one token.
    </p>
  </div>
);
