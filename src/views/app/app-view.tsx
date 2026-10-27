import Link from "next/link";

import { app } from "@/data/mocks/app";

import { AppConsole } from "./app-console";

/**
 * The product screen (`/app`) — ASTRA's console in the hero's own visual
 * language: deep-space ground, frosted glass, Mulish, the orbit mark, one pink
 * accent. A plain scrollable page (no WebGL scene): the top bar and the console
 * leaf below carry it. Content is mock; nothing here places an order.
 */
export const AppView = () => {
  const { wallet } = app;

  return (
    <main className="relative min-h-lvh w-full overflow-hidden bg-background text-white">
      {/* Ground glows — the same deep blue the scene sits in. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 40% at 50% -8%, rgb(58 92 255 / 0.22), transparent 70%), radial-gradient(44% 34% at 100% 108%, rgb(255 95 168 / 0.08), transparent 70%)",
        }}
      />

      {/* Top bar. */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-background/70 backdrop-blur-[10px]">
        <div className="mx-auto flex max-w-[var(--container-max)] items-center justify-between gap-[12px] page-gutter py-[16px]">
          <Link href="/" aria-label="ASTRA home" className="flex items-center gap-[10px]">
            <svg viewBox="0 0 24 24" width={22} height={22} fill="none" aria-hidden="true" className="shrink-0">
              <circle cx="12" cy="12" r="9" stroke="#9fb8ff" strokeWidth="1.4" />
              <circle cx="12" cy="12" r="5" stroke="#ff8fc4" strokeWidth="1.4" />
            </svg>
            <span className="font-mulish text-[18px] leading-none tracking-[0.04em] text-white">
              ASTRA
            </span>
            <span className="rounded-full border border-[color:var(--hero-glass-border)] px-[9px] py-[3px] font-mulish text-[11px] tracking-[0.12em] text-white/55 uppercase">
              App
            </span>
          </Link>

          <div className="flex items-center gap-[8px]">
            <span className="hidden items-center gap-[7px] rounded-full border border-[color:var(--hero-glass-border)] px-[13px] py-[8px] font-mulish text-[13px] text-white/75 sm:inline-flex">
              <span className="size-[7px] rounded-full bg-accent-300" />
              {wallet.network}
            </span>
            <span className="flex items-center gap-[10px] rounded-full border border-[color:var(--hero-glass-border)] bg-[var(--hero-glass)] px-[16px] py-[8px]">
              <span className="font-mulish text-[15px] text-white">{wallet.balance}</span>
              <span className="hidden font-mulish text-[13px] text-white/40 sm:inline">
                {wallet.address}
              </span>
            </span>
          </div>
        </div>
      </header>

      {/* Console. */}
      <div className="relative mx-auto max-w-[var(--container-max)] page-gutter pt-[40px] pb-[72px] sm:pt-[56px]">
        <AppConsole content={app} />
      </div>
    </main>
  );
};
