"use client";

import { useEffect, useState } from "react";
import { animated, useSpring } from "@react-spring/web";

import { useRobot } from "@/components/common/robot-view";
import type { HeroFormContent } from "@/data/mocks/home";
import { FancyButton } from "@/components/ui/fancy-button";
import { Press } from "@/components/ui/press";
import { AstraMark } from "@/components/ui/astra-mark";

/**
 * The hero action pill — the contract chip and X, nothing else (the app is one
 * click away in the nav).
 *
 * It hugs its content (no dead glass) inside a flat hairline, and stays alive at
 * rest: the moon in the CA chip's mark keeps orbiting. Spring-driven (hard rule #1), still under reduced
 * motion.
 *
 * `layout="row"` is the desktop pill; `layout="stack"` reflows full-width for
 * phones. Every label comes from content.
 */

const BORDER = "rgb(255 255 255 / 0.14)";

/** Motion off: the robot form, or a reduced-motion preference. */
const useStill = () => {
  const robot = useRobot();
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  return robot || reduced;
};

/**
 * The contract chip: the $ASTRA mark with its moon in orbit, the ticker, a CA
 * badge and the address — "Coming soon" until the mint is live. Hover lights
 * its edge; a click copies the address once there is one, and until then
 * answers with a small shake and "Launching soon".
 */
const CaChip = ({ form, full }: { form: HeroFormContent; full: boolean }) => {
  const still = useStill();
  const live = form.ca.length >= 32;
  const [note, setNote] = useState<string | null>(null);
  const [hover, setHover] = useState(false);

  const [{ edge, shake }, api] = useSpring(() => ({ edge: 0, shake: 0, config: { tension: 260, friction: 20 } }));

  const enter = () => {
    setHover(true);
    if (!still) api.start({ edge: 1, config: { tension: 120, friction: 22 } });
  };
  const leave = () => {
    setHover(false);
    api.start({ edge: 0 });
  };
  const click = () => {
    if (live) {
      void navigator.clipboard?.writeText(form.ca).then(() => setNote("Copied"));
    } else {
      setNote("Launching soon");
      if (!still) api.start({ from: { shake: 0 }, to: [{ shake: 1 }, { shake: -1 }, { shake: 0.6 }, { shake: 0 }], config: { tension: 900, friction: 18 } });
    }
    window.setTimeout(() => setNote(null), 1600);
  };

  return (
    <animated.button
      type="button"
      onClick={click}
      onPointerEnter={enter}
      onPointerLeave={leave}
      aria-label={live ? `Copy contract address ${form.ca}` : `Contract address: ${form.ca}`}
      className={`flex h-[46px] items-center gap-[12px] rounded-full bg-white/[0.045] pr-[18px] pl-[6px] ${full ? "w-full justify-center" : "shrink-0"}`}
      style={{
        boxShadow: edge.to((v) => `inset 0 0 0 1px rgb(210 189 255 / ${(0.1 + 0.45 * v).toFixed(3)})`),
        transform: shake.to((v) => `translateX(${(v * 5).toFixed(2)}px)`),
      }}
    >
      <span aria-hidden="true" className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#0b0f22]">
        <AstraMark size={26} live />
      </span>
      <span className="font-mulish text-[15px] leading-none text-white">$ASTRA</span>
      <span className="rounded-full border border-accent-300/40 bg-accent-500/10 px-[8px] py-[4px] font-mono text-[13px] leading-none text-accent-200">
        {form.caLabel}
      </span>
      <span className={`font-mulish text-[15px] leading-none ${hover || note ? "text-white" : "text-white/80"}`}>
        {note ?? form.ca}
      </span>
    </animated.button>
  );
};

export interface ContactFormProps {
  form: HeroFormContent;
  layout?: "row" | "stack";
}

export const ContactForm = ({ form, layout = "row" }: ContactFormProps) => {
  const row = layout === "row";

  return (
    <div
      className={row ? "rounded-full p-px" : "w-full rounded-[28px] p-px"}
      style={{ background: BORDER }}
    >
      <div
        className={
          row
            ? "flex items-center gap-[8px] rounded-full bg-background/85 p-[6px] backdrop-blur-[10px]"
            : "flex flex-col gap-[8px] rounded-[27px] bg-background/85 p-[8px] backdrop-blur-[10px]"
        }
      >
        {/* CA — reads "coming soon" until the mint is live. */}
        <Press mode="lift" block={!row} className={row ? "shrink-0" : "w-full"}>
          <CaChip form={form} full={!row} />
        </Press>

        {/* X. */}
        {row ? (
          <FancyButton
            href={form.xHref}
            variant="ghost"
            size="md"
            icon="x"
            label={form.xLabel}
            className="shrink-0"
          />
        ) : (
          <FancyButton
            href={form.xHref}
            variant="ghost"
            size="md"
            icon="x"
            label={form.xLabel}
            full
          >
            Follow on X
          </FancyButton>
        )}
      </div>
    </div>
  );
};
