"use client";

import { useState } from "react";
import Link from "next/link";

import { AstraMark } from "@/components/ui/astra-mark";
import type { AppContent } from "@/data/mocks/app";
import { scrollTo } from "@/utils/scroll-to";
import { FancyButton } from "@/components/ui/fancy-button";
import { Press } from "@/components/ui/press";

import { AssetsView } from "./assets-view";
import { BasketView } from "./basket-view";
import { CreateView } from "./create-view";
import { ExploreView } from "./explore-view";
import { Segmented } from "./ui";
import { WalletView } from "./wallet-view";
import { AppDataProvider, useAppData } from "./app-data";

/**
 * The app's frame — the top bar (mark, the four screens on a sliding pill,
 * search, log in), the active screen, and the footer. Screens switch in place;
 * each one re-enters with its own staggered reveal.
 */

type Tab = "explore" | "assets" | "create" | "wallet";


export const AppShell = ({ content }: { content: AppContent }) => (
  <AppDataProvider initial={content}>
    <Shell />
  </AppDataProvider>
);

const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

const Shell = () => {
  const { content, user } = useAppData();
  const [tab, setTab] = useState<Tab>("explore");
  const [basketId, setBasketId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const go = (next: Tab) => {
    setBasketId(null);
    setTab(next);
    scrollTo(0, true);
  };
  const open = (id: string) => {
    setBasketId(id);
    scrollTo(0, true);
  };
  const basket = basketId ? content.baskets.find((b) => b.id === basketId) : undefined;

  return (
    <div className="relative z-10 flex min-h-lvh flex-col">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/55 backdrop-blur-[16px]">
        <div className="page-gutter mx-auto flex h-[72px] w-full max-w-[var(--container-max)] items-center justify-between gap-[16px]">
          <Press mode="grow" className="shrink-0">
            <Link href="/" aria-label="ASTRA home" className="flex items-center gap-[10px]">
              <AstraMark size={28} live className="shrink-0" />
              <span className="font-mulish text-[19px] leading-none tracking-[0.04em] text-white">ASTRA</span>
            </Link>
          </Press>

          <nav aria-label="App" className="overflow-x-auto max-hero-sm:hidden">
            <Segmented<Tab>
              value={tab}
              onChange={go}
              options={[
                { value: "explore", label: "Explore" },
                { value: "assets", label: "Assets" },
                { value: "create", label: "Create" },
                { value: "wallet", label: "Wallet" },
              ]}
            />
          </nav>

          <div className="flex items-center gap-[10px]">
            <label className="flex h-[42px] w-[230px] items-center gap-[10px] rounded-full border border-white/[0.1] bg-white/[0.04] px-[15px] max-pad-sm:hidden">
              <svg viewBox="0 0 24 24" className="size-[16px] shrink-0 text-white/45" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (tab !== "assets" || basketId) go("assets");
                }}
                placeholder="Search assets, tickers"
                aria-label="Search"
                className="w-full bg-transparent font-mulish text-[14px] text-white outline-none placeholder:text-white/35"
              />
            </label>
            {user ? (
              <FancyButton variant="ghost" size="sm" icon="none" onClick={() => go("wallet")}>
                {short(user.wallet)}
              </FancyButton>
            ) : (
              <FancyButton variant="primary" size="sm" onClick={() => go("wallet")}>
                Log in
              </FancyButton>
            )}
          </div>
        </div>

        {/* Phones: the screens get their own row. */}
        <nav aria-label="App" className="page-gutter hidden overflow-x-auto pb-[12px] max-hero-sm:block">
          <Segmented<Tab>
            value={tab}
            onChange={go}
            options={[
              { value: "explore", label: "Explore" },
              { value: "assets", label: "Assets" },
              { value: "create", label: "Create" },
              { value: "wallet", label: "Wallet" },
            ]}
          />
        </nav>
      </header>

      <main
        key={basket ? `basket-${basket.id}` : tab}
        className="page-gutter mx-auto w-full max-w-[var(--container-max)] flex-1 pt-[48px] pb-[96px] max-hero-sm:pt-[28px]"
      >
        {basket ? (
          <BasketView basket={basket} onBack={() => go("explore")} onLogin={() => go("wallet")} />
        ) : tab === "assets" ? (
          <AssetsView content={content} query={query} onQuery={setQuery} />
        ) : tab === "create" ? (
          <CreateView content={content} onCreated={open} onLogin={() => go("wallet")} />
        ) : tab === "wallet" ? (
          <WalletView />
        ) : (
          <ExploreView
            content={content}
            onOpen={open}
            onCreate={() => go("create")}
            onAssets={() => go("assets")}
          />
        )}
      </main>

      <footer className="border-t border-white/[0.06] bg-background/50 backdrop-blur-[12px]">
        <div className="page-gutter mx-auto flex w-full max-w-[var(--container-max)] flex-wrap items-center justify-between gap-[14px] py-[22px] font-mulish text-[14px] text-white/45">
          <span className="flex items-center gap-[10px]">
            <AstraMark size={20} className="shrink-0" />
            Not yet audited. Tokenized assets carry issuer and market risk. Not investment advice.
          </span>
          <span className="flex gap-[20px]">
            <Press>
              <Link href="/" className="hover:text-white">Home</Link>
            </Press>
            <Press>
              <a href="https://x.com/astra" target="_blank" rel="noopener noreferrer" className="hover:text-white">
                X
              </a>
            </Press>
          </span>
        </div>
      </footer>
    </div>
  );
};
