"use client";

import {
  animated,
  useSprings,
  useTransition,
  type SpringValue,
} from "@react-spring/web";
import type { Ref } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import type { HeroNavContent } from "@/data/mocks/home";

/** The curtain opening — weighty, like the nav's own 1 s reveal. */
const OPEN = { tension: 150, friction: 28 } as const;
/** Closing runs the same film back, quicker: the reader has decided. */
const CLOSE = { tension: 300, friction: 34 } as const;
/** Each row's rise out of its mask, and its focus-pull. */
const ROW = { tension: 220, friction: 26 } as const;
/** Rows wait for the circle to cover most of the screen (ms). */
const ENTER_LEAD = 160;
const ENTER_STEP = 60;
const LEAVE_STEP = 25;

/** Where the circle grows from: the burger's centre, in viewport px. */
export interface MenuOrigin {
  x: number;
  y: number;
  radius: number;
}

export interface HeroNavMenuProps {
  id: string;
  ref: Ref<HTMLDivElement>;
  open: boolean;
  origin: MenuOrigin;
  content: HeroNavContent;
  onGo: (target: string) => void;
}

/**
 * The phone menu — a full-screen field of the vortex's deep space, opened by a
 * circle that grows out of the burger (D-036).
 *
 * The ground is the CTA's own sweep turned into light: blue → violet glowing
 * from the burger's corner, a faint lilac floor. Once the circle has covered
 * most of the screen the chapters rise out of their masks one after another in
 * the nav's Mulish, each pulling focus from a blur the way the nav pills arrive
 * on load (once per line — never per letter), and the gradient CTA follows.
 * Closing runs the film backwards, faster. Rows never fade, so their contrast
 * holds on every frame. Reduced motion: `ReducedMotion` sets react-spring's
 * `skipAnimation`, so the menu simply appears.
 *
 * It sits **under** the nav bar (z 110 < 120): the logo pill and the burger
 * stay where they are, and the burger's bars cross into the × in place — the
 * thing that opened the menu is the thing that shuts it.
 *
 * Sized to the **dynamic** viewport, top-anchored (D-037): `inset-0` + `lvh`
 * put its foot under Safari's bottom toolbar and cut the CTA. A menu is static
 * UI — `dvh` is right here (the large-viewport rule is for the scene canvas).
 * The foot also clears the home indicator (`--hero-menu-pad-bottom`).
 *
 * Portalled to `<body>`: the bar's reveal `Spring` keeps a resting transform,
 * which would make it the containing block of a `fixed` child.
 */
export const HeroNavMenu = ({ open, ...panel }: HeroNavMenuProps) => {
  const transitions = useTransition(open, {
    from: { reveal: 0 },
    enter: { reveal: 1, config: OPEN },
    leave: { reveal: 0, config: CLOSE },
  });

  return transitions(
    (style, isOpen) =>
      isOpen && <MenuPanel {...panel} open={open} reveal={style.reveal} />,
  );
};

interface MenuPanelProps extends Omit<HeroNavMenuProps, "open"> {
  open: boolean;
  reveal: SpringValue<number>;
}

const MenuPanel = ({
  id,
  ref,
  open,
  reveal,
  origin,
  content,
  onGo,
}: MenuPanelProps) => {
  // Every chapter, then the CTA.
  const count = content.links.length + 1;
  const [rows] = useSprings(
    count,
    (index) => ({
      from: { y: 110, blur: 8, rule: 0 },
      to: { y: open ? 0 : 110, blur: open ? 0 : 8, rule: open ? 1 : 0 },
      delay: open
        ? ENTER_LEAD + index * ENTER_STEP
        : (count - 1 - index) * LEAVE_STEP,
      config: ROW,
    }),
    [open],
  );

  const rise = (index: number) => ({
    transform: rows[index].y.to((v) => `translate3d(0, ${v}%, 0)`),
    // Blur only while it moves; `none` at rest so a settled line is no layer.
    filter: rows[index].blur.to((v) => (v < 0.05 ? "none" : `blur(${v}px)`)),
  });
  const draw = (index: number) => ({
    transform: rows[index].rule.to((v) => `scaleX(${v})`),
  });

  /* Made here, not in the `transitions` callback: a bare portal has no element
     type for react-spring to key by, and it remounted (dropping focus) when
     the leaving item left the list (fromzero). */
  return createPortal(
    <animated.div
      ref={ref}
      id={id}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="fixed inset-x-0 top-0 z-[110] flex h-dvh flex-col overflow-y-auto overscroll-contain bg-hero-menu-ground px-[20px] pt-[112px] pb-(--hero-menu-pad-bottom) text-white will-change-[clip-path]"
      style={{
        clipPath: reveal.to(
          (v) =>
            `circle(${v * origin.radius}px at ${origin.x}px ${origin.y}px)`,
        ),
      }}
    >
      {/* The glow brightens as the circle opens, so the light arrives with it. */}
      <animated.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[image:var(--gradient-hero-menu)]"
        style={{ opacity: reveal }}
      />

      <nav aria-label="Chapters" className="relative flex flex-1 flex-col">
        <ul className="flex flex-col">
          {content.links.map((link, index) => (
            <li key={link.label} className="relative">
              <animated.span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-px origin-left bg-hero-menu-rule"
                style={draw(index)}
              />
              <div className="overflow-hidden">
                <animated.div style={rise(index)}>
                  <button
                    type="button"
                    onClick={() => onGo(link.target)}
                    className="flex w-full items-baseline justify-between gap-[16px] py-[18px] text-left font-mulish text-[clamp(2.5rem,12vw,3.75rem)] leading-[1.05] font-light tracking-[-0.02em] text-white"
                  >
                    {link.label}
                    <span
                      aria-hidden="true"
                      className="font-mulish text-[13px] leading-none font-normal tracking-[0.2em] text-accent-300"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </button>
                </animated.div>
              </div>
            </li>
          ))}
          <li aria-hidden="true" className="relative h-px">
            <animated.span
              className="absolute inset-0 origin-left bg-hero-menu-rule"
              style={draw(content.links.length - 1)}
            />
          </li>
        </ul>
      </nav>

      <div className="relative mt-[40px] overflow-hidden">
        <animated.div style={rise(content.links.length)}>
          <Link
            href="/app"
            className="flex h-[56px] w-full items-center justify-center gap-[10px] rounded-[50px]"
            style={{ backgroundImage: "var(--gradient-hero-cta)" }}
          >
            <span className="font-mulish text-[17px] leading-none font-normal whitespace-nowrap text-white">
              {content.ctaLabel}
            </span>
            <span
              aria-hidden="true"
              className="size-[3px] shrink-0 rounded-full bg-white"
            />
          </Link>
        </animated.div>
      </div>
    </animated.div>,
    document.body,
  );
};
