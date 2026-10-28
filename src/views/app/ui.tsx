"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { animated, useSpring } from "@react-spring/web";

import { Spring } from "@/components/common/robot-spring";
import { easeReveal } from "@/utils/animation/easing";

/**
 * Shared pieces of the app: the mount reveal, the glass card class, the
 * segmented control with its sliding pill, a change badge, the price flash, and
 * the slide-to-confirm knob. All motion is `@react-spring/web` (hard rule #1).
 */

const REVEAL = { duration: 1100, easing: easeReveal } as const;

/** The frosted panel every card in the app sits on. */
export const GLASS =
  "rounded-[24px] border border-white/[0.08] bg-surface-deep/60 backdrop-blur-[14px] shadow-[0_30px_80px_-40px_rgb(0_0_0/0.9)]";

/* ------------------------------------------------------------------- reveal */

type SpringTag = ComponentProps<typeof Spring>["tag"];

export interface RevealProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  tag?: SpringTag;
  className?: string;
}

/** Rises in once on mount — every screen of the app enters with it. */
export const Reveal = ({ children, delay = 0, y = 18, tag = "div", className }: RevealProps) => {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(true), []);
  return (
    <Spring
      tag={tag}
      enabled={on}
      from={{ opacity: 0, y, filter: "blur(8px)" }}
      to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      delayIn={delay}
      config={REVEAL}
      className={className}
    >
      {children}
    </Spring>
  );
};

/* ---------------------------------------------------------------- segmented */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Pill tabs; the active pill slides between options on a spring. */
export const Segmented = <T extends string>({
  options,
  value,
  onChange,
  className = "",
}: SegmentedProps<T>) => {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const first = useRef(true);
  const [pill, api] = useSpring(() => ({ x: 0, w: 0, s: 1, config: { tension: 380, friction: 32 } }));
  /* A faint second pill follows the pointer, so the options answer the hover. */
  const [ghost, ghostApi] = useSpring(() => ({ x: 0, w: 0, o: 0, config: { tension: 420, friction: 34 } }));
  const hoverTo = (key: string) => {
    const el = refs.current[key];
    if (!el || key === value) return ghostApi.start({ o: 0 });
    ghostApi.start({ x: el.offsetLeft, w: el.offsetWidth, o: 1, immediate: (k) => k !== "o" && ghost.o.get() < 0.05 });
  };

  useEffect(() => {
    const measure = () => {
      const el = refs.current[value];
      if (!el) return;
      api.start({ x: el.offsetLeft, w: el.offsetWidth, immediate: first.current });
      first.current = false;
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, options, api]);

  return (
    <div
      role="tablist"
      onPointerLeave={() => ghostApi.start({ o: 0 })}
      className={`relative inline-flex rounded-full border border-white/[0.08] bg-white/[0.035] p-[4px] ${className}`}
    >
      <animated.span
        aria-hidden="true"
        className="absolute top-[4px] bottom-[4px] rounded-full bg-white/[0.05]"
        style={{ left: ghost.x, width: ghost.w, opacity: ghost.o }}
      />
      <animated.span
        aria-hidden="true"
        className="absolute top-[4px] bottom-[4px] rounded-full border border-white/[0.12] bg-white/[0.1]"
        style={{ left: pill.x, width: pill.w, transform: pill.s.to((v) => `scale(${v.toFixed(3)})`) }}
      />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[o.value] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            onPointerEnter={() => hoverTo(o.value)}
            onPointerDown={() => api.start({ s: 0.94 })}
            onPointerUp={() => api.start({ s: 1 })}
            className={`relative z-10 rounded-full px-[16px] py-[8px] font-mulish text-[14px] leading-none whitespace-nowrap ${on ? "text-white" : "text-white/55 hover:text-white/85"}`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={`ml-[7px] ${on ? "text-accent-300" : "text-white/35"}`}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/* ------------------------------------------------------------------- change */

export const Change = ({ value, className = "" }: { value: number; className?: string }) => {
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-[4px] font-mono leading-none ${up ? "text-accent-300" : "text-signal-ring"} ${className}`}
    >
      <svg viewBox="0 0 10 10" className="size-[0.7em]" aria-hidden="true">
        <path d={up ? "M5 1.5 9 8H1z" : "M5 8.5 1 2h8z"} fill="currentColor" />
      </svg>
      {Math.abs(value).toFixed(2)}%
    </span>
  );
};

/* -------------------------------------------------------------- price flash */

/** Wraps a live price; a soft wash flashes behind it each time it moves. */
export const PriceFlash = ({ value, up, children }: { value: number; up: boolean; children: ReactNode }) => {
  const [s, api] = useSpring(() => ({ o: 0 }));
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    api.start({ from: { o: 1 }, to: { o: 0 }, config: { duration: 1100 } });
  }, [value, api]);
  return (
    <span className="relative inline-block">
      <animated.span
        aria-hidden="true"
        className={`absolute -inset-x-[8px] -inset-y-[5px] rounded-[8px] ${up ? "bg-accent-400/25" : "bg-signal-glow/25"}`}
        style={{ opacity: s.o }}
      />
      <span className="relative">{children}</span>
    </span>
  );
};

/** Nudges a value every `ms` by up to ±`pct`% — a market that's awake. */
export const useLive = (base: number, pct = 0.12, ms = 2200): number => {
  const [v, setV] = useState(base);
  useEffect(() => {
    setV(base);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setV((x) => x * (1 + ((Math.random() - 0.48) * pct) / 100));
    }, ms);
    return () => window.clearInterval(id);
  }, [base, pct, ms]);
  return v;
};

/* --------------------------------------------------------- slide to confirm */

export interface SlideToConfirmProps {
  label: string;
  doneLabel: string;
  onConfirm?: () => void;
}

const KNOB = 52;

/**
 * The reference app's trade gesture: drag the knob the whole way to confirm; let
 * go early and it springs back. Enter or Space on the knob confirms too.
 */
export const SlideToConfirm = ({ label, doneLabel, onConfirm }: SlideToConfirmProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: number; max: number } | null>(null);
  /* The knob's latest position — read on release, so a fast drag that ends
   * before the spring's next frame still counts. */
  const pos = useRef(0);
  const [done, setDone] = useState(false);
  const [{ x }, api] = useSpring(() => ({ x: 0, config: { tension: 320, friction: 24 } }));

  const max = () => (trackRef.current?.clientWidth ?? 300) - KNOB - 8;

  const finish = () => {
    pos.current = max();
    api.start({ x: pos.current });
    setDone(true);
    onConfirm?.();
    window.setTimeout(() => {
      setDone(false);
      pos.current = 0;
      api.start({ x: 0 });
    }, 2600);
  };

  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (done) return;
    drag.current = { start: e.clientX - pos.current, max: max() };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    pos.current = Math.min(d.max, Math.max(0, e.clientX - d.start));
    api.start({ x: pos.current, immediate: true });
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (pos.current > d.max * 0.88) finish();
    else {
      pos.current = 0;
      api.start({ x: 0 });
    }
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === "Enter" || e.key === " ") && !done) {
      e.preventDefault();
      finish();
    }
  };

  return (
    <div
      ref={trackRef}
      className="relative h-[60px] overflow-hidden rounded-full border border-white/[0.1] bg-white/[0.04] p-[4px]"
    >
      <animated.span
        aria-hidden="true"
        className="absolute top-[4px] bottom-[4px] left-[4px] rounded-full"
        style={{
          width: x.to((v) => v + KNOB),
          backgroundImage: "var(--gradient-hero-cta)",
          opacity: x.to((v) => 0.35 + Math.min(0.65, v / 220)),
        }}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center pl-[40px] font-mulish text-[15px] text-white/75">
        {done ? doneLabel : label}
      </span>
      <animated.button
        type="button"
        aria-label={label}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className="relative z-10 flex size-[52px] cursor-grab touch-none items-center justify-center rounded-full bg-white shadow-[0_8px_24px_-6px_rgb(109_139_255/0.8)] active:cursor-grabbing"
        style={{ transform: x.to((v) => `translateX(${v.toFixed(1)}px)`) }}
      >
        {done ? (
          <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#05060F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" aria-hidden="true">
            <path d="M8 6l6 6-6 6M13 6l6 6-6 6" stroke="#05060F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </animated.button>
    </div>
  );
};
