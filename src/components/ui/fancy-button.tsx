"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { animated, to, useReducedMotion, useSpring } from "@react-spring/web";

import { useRobot } from "@/components/common/robot-view";

/**
 * ASTRA's one button. Flat colours only; all the life is in the motion:
 *
 *  - **Flood.** On hover a disc of the opposite colour swells out of the icon
 *    coin until it fills the pill, so the button turns itself inside out — the
 *    label and the coin swap colours with it.
 *  - **Roll.** The label rolls up and a fresh copy rolls in from below.
 *  - **Swap.** The arrow leaves the coin to the right as a new one slides in.
 *  - **Magnet.** The pill leans a few px toward the pointer, the label a touch
 *    further, so it feels held rather than hovered.
 *  - **Press.** It sinks a little under the click.
 *
 * Everything is a spring (hard rule #1); reduced motion and the robot form get
 * the colour swap with no travel. Renders a Next `Link` for internal paths, an
 * external `<a>` for URLs, otherwise a `<button>`.
 */

type Variant = "primary" | "light" | "ghost";
type Size = "sm" | "md" | "lg";
type Icon = "arrow" | "plus" | "x" | "none";

const SKIN: Record<Variant, { bg: string; fg: string; flood: string; floodFg: string; coin: string; coinFg: string; border: string }> = {
  primary: { bg: "#4977ff", fg: "#ffffff", flood: "#ffffff", floodFg: "#05060f", coin: "#ffffff", coinFg: "#05060f", border: "rgba(255,255,255,0)" },
  light: { bg: "#ffffff", fg: "#05060f", flood: "#4977ff", floodFg: "#ffffff", coin: "#4977ff", coinFg: "#ffffff", border: "rgba(255,255,255,0)" },
  ghost: { bg: "rgba(255,255,255,0.05)", fg: "#ffffff", flood: "#ffffff", floodFg: "#05060f", coin: "rgba(255,255,255,0.12)", coinFg: "#ffffff", border: "rgba(255,255,255,0.16)" },
};

const HEIGHT: Record<Size, number> = { sm: 42, md: 48, lg: 56 };
const TEXT: Record<Size, number> = { sm: 14, md: 15, lg: 17 };

const SPRING = { tension: 260, friction: 26 } as const;
const MAGNET = { tension: 220, friction: 18 } as const;

const Glyph = ({ icon }: { icon: Icon }) => {
  if (icon === "plus")
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-[16px]">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  if (icon === "x")
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-[16px]">
        <path d="M18 3h3l-7 8 8 10h-6l-5-6-5 6H3l7-9L2 3h6l4 5 6-5zm-1 16h2L8 5H6l11 14z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-[16px]">
      <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export interface FancyButtonProps {
  children?: ReactNode;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: Variant;
  size?: Size;
  icon?: Icon;
  /** Stretch to the container's width. */
  full?: boolean;
  /** Accessible name — required when there is no visible label. */
  label?: string;
  className?: string;
}

export const FancyButton = ({
  children,
  href,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  icon = "arrow",
  full = false,
  label,
  className = "",
}: FancyButtonProps) => {
  const reduced = Boolean(useReducedMotion());
  const robot = useRobot();
  const still = reduced || robot;
  const skin = SKIN[variant];
  const h = HEIGHT[size];
  const coin = h - 10;
  const iconOnly = children === undefined || children === null;

  const ref = useRef<HTMLSpanElement>(null);
  const [reach, setReach] = useState(8);

  const [{ t }, api] = useSpring(() => ({ t: 0, config: SPRING }));
  const [{ mx, my, press }, mag] = useSpring(() => ({ mx: 0, my: 0, press: 1, config: MAGNET }));

  const enter = () => {
    const box = ref.current?.getBoundingClientRect();
    // Enough scale for the disc (coin-sized) to cover the far corner.
    if (box) setReach((Math.hypot(box.width, box.height) * 2) / coin + 1);
    api.start({ t: 1 });
  };
  const leave = () => {
    api.start({ t: 0 });
    mag.start({ mx: 0, my: 0, press: 1 });
  };
  const move = (e: React.PointerEvent) => {
    if (still || e.pointerType !== "mouse") return;
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    mag.start({
      mx: ((e.clientX - box.left) / box.width - 0.5) * 10,
      my: ((e.clientY - box.top) / box.height - 0.5) * 8,
    });
  };

  const fg = t.to({ range: [0, 1], output: [skin.fg, skin.floodFg] });
  const coinBg = t.to({ range: [0, 1], output: [skin.coin, skin.flood === "#ffffff" ? "#4977ff" : "#ffffff"] });
  const coinFg = t.to({ range: [0, 1], output: [skin.coinFg, skin.flood === "#ffffff" ? "#ffffff" : "#4977ff"] });

  const inner = (
    <>
      {/* The flood — swells out of the coin (or the centre, label-only). */}
      <animated.span
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full"
        style={{
          width: coin,
          height: coin,
          top: (h - coin) / 2,
          ...(icon !== "none" && !iconOnly ? { right: 5 } : { left: `calc(50% - ${coin / 2}px)` }),
          background: skin.flood,
          transform: t.to((v) => `scale(${(v * reach).toFixed(3)})`),
        }}
      />

      {!iconOnly && (
        <animated.span
          className="relative block overflow-hidden whitespace-nowrap"
          style={{
            color: fg,
            fontSize: TEXT[size],
            lineHeight: `${TEXT[size] + 6}px`,
            height: TEXT[size] + 6,
            transform: to([mx, my], (x: number, y: number) => `translate(${(x * 0.35).toFixed(2)}px, ${(y * 0.35).toFixed(2)}px)`),
          }}
        >
          <animated.span
            className="block"
            style={{ transform: t.to((v) => `translateY(${(still ? 0 : -v * 100).toFixed(2)}%)`) }}
          >
            {children}
          </animated.span>
          <animated.span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 block"
            style={{ transform: t.to((v) => `translateY(${(still ? 100 : (1 - v) * 100).toFixed(2)}%)`) }}
          >
            {children}
          </animated.span>
        </animated.span>
      )}

      {icon !== "none" && (
        <animated.span
          aria-hidden="true"
          className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full"
          style={{
            width: coin,
            height: coin,
            background: iconOnly ? "transparent" : coinBg,
            color: iconOnly ? fg : coinFg,
          }}
        >
          <animated.span
            className="absolute"
            style={{ transform: t.to((v) => (icon === "arrow" && !still ? `translateX(${(v * coin).toFixed(2)}px)` : "none")) }}
          >
            <Glyph icon={icon} />
          </animated.span>
          {icon === "arrow" && !still && (
            <animated.span
              className="absolute"
              style={{ transform: t.to((v) => `translateX(${((v - 1) * coin).toFixed(2)}px)`) }}
            >
              <Glyph icon={icon} />
            </animated.span>
          )}
        </animated.span>
      )}
    </>
  );

  const shell = `relative isolate flex items-center overflow-hidden rounded-full font-mulish font-normal ${
    iconOnly ? "justify-center" : icon === "none" ? "justify-center px-[24px]" : "justify-between gap-[14px] pr-[5px] pl-[24px]"
  } ${full ? "w-full" : ""}`;
  const shellStyle = {
    height: h,
    minWidth: iconOnly ? h : undefined,
    width: iconOnly && !full ? h : undefined,
    background: skin.bg,
    boxShadow: `inset 0 0 0 1px ${skin.border}`,
  };

  const element = href ? (
    href.startsWith("/") ? (
      <Link href={href} aria-label={label} className={shell} style={shellStyle} onClick={onClick}>
        {inner}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={shell} style={shellStyle}>
        {inner}
      </a>
    )
  ) : (
    <button type={type} onClick={onClick} aria-label={label} className={shell} style={shellStyle}>
      {inner}
    </button>
  );

  return (
    <animated.span
      ref={ref}
      onPointerEnter={enter}
      onPointerLeave={leave}
      onPointerMove={move}
      onPointerDown={() => mag.start({ press: 0.96 })}
      onPointerUp={() => mag.start({ press: 1 })}
      className={`inline-block ${full ? "w-full" : ""} ${className}`}
      style={{
        transform: to(
          [mx, my, press],
          (x: number, y: number, s: number) => `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(3)})`,
        ),
      }}
    >
      {element}
    </animated.span>
  );
};
