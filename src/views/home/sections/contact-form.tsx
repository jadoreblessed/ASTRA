"use client";

import Link from "next/link";

import { Hover } from "@/components/common/touch-hover";
import type { HeroFormContent } from "@/data/mocks/home";

/**
 * The frosted hero action pill — ASTRA's redesign of the original contact form.
 *
 * A token page doesn't open with a name and an email, so the two inputs are
 * replaced by the two controls a launch actually leads with: the contract chip
 * (it reads "coming soon" until the mint is live) and the X link. The gradient
 * CTA stays — it is the one button every scene on the site lifts the same way.
 *
 * `layout="row"` is the desktop inline pill; `layout="stack"` reflows full-width
 * for mobile and the closing scene. Every label comes from content.
 */

const HOVER = { tension: 320, friction: 22 } as const;

export interface ContactFormProps {
  form: HeroFormContent;
  layout?: "row" | "stack";
}

export const ContactForm = ({ form, layout = "row" }: ContactFormProps) => {
  const row = layout === "row";

  const chip =
    "flex items-center gap-[10px] rounded-[26px] border border-[color:var(--hero-glass-border)] text-white hover:bg-white/[0.06]";

  return (
    <div
      className={
        row
          ? "flex items-center gap-[10px] rounded-[40px] border border-[color:var(--hero-glass-border)] bg-[var(--hero-glass)] p-[6px] pl-[14px] backdrop-blur-[8px]"
          : "flex flex-col gap-[10px] rounded-[24px] border border-[color:var(--hero-glass-border)] bg-[var(--hero-glass)] p-[10px] backdrop-blur-[8px]"
      }
    >
      {/* CA — reads "coming soon" until the mint is live. */}
      <div
        aria-label={`Contract address: ${form.ca}`}
        className={`flex items-center gap-[12px] rounded-[26px] border border-[color:var(--hero-glass-border)] font-mono leading-none ${row ? "shrink-0 px-[16px] py-[13px]" : "w-full justify-center px-[16px] py-[15px]"}`}
      >
        <span className="text-[11px] tracking-[0.18em] text-white/40">{form.caLabel}</span>
        <span aria-hidden="true" className="h-[12px] w-px bg-white/20" />
        <span className="text-[12px] tracking-[0.08em] text-white/85 uppercase">{form.ca}</span>
      </div>

      {/* X. */}
      <Hover
        tag="div"
        from={{ scale: 1 }}
        to={{ scale: 1.06 }}
        config={HOVER}
        className={row ? "shrink-0" : "w-full"}
      >
        <a
          href={form.xHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={form.xLabel}
          className={`${chip} ${row ? "size-[44px] justify-center !rounded-full px-0" : "w-full justify-center px-[16px] py-[14px]"}`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-[16px]">
            <path d="M18 3h3l-7 8 8 10h-6l-5-6-5 6H3l7-9L2 3h6l4 5 6-5zm-1 16h2L8 5H6l11 14z" />
          </svg>
          {!row && <span className="font-mulish text-[15px]">Follow on X</span>}
        </a>
      </Hover>

      {/* Open the app — the gradient CTA, unchanged. */}
      <Hover
        tag="div"
        from={{ scale: 1 }}
        to={{ scale: 1.03 }}
        config={HOVER}
        className={row ? "shrink-0" : "w-full"}
      >
        <Link
          href="/app"
          className={
            row
              ? "flex w-full shrink-0 items-center justify-center gap-[8px] rounded-[50px] py-[2px] pr-[26px] pl-[2px]"
              : "flex w-full items-center justify-center gap-[10px] rounded-[50px] py-[6px] pr-[24px] pl-[6px]"
          }
          style={{ backgroundImage: "var(--gradient-hero-cta)" }}
        >
          <span className="relative block size-[39px] shrink-0">
            <span className="absolute top-0 left-0 size-[39px] rounded-[50px] bg-white" />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 size-[23px] -translate-x-1/2 -translate-y-1/2"
            >
              <path
                d="M9 6l6 6-6 6"
                stroke="#05060F"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="font-mulish text-[16px] leading-[1.2] font-normal whitespace-nowrap text-white">
            {form.submit}
          </span>
        </Link>
      </Hover>
    </div>
  );
};
