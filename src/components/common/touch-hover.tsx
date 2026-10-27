"use client";

import { forwardRef, type ComponentProps, type ComponentType } from "react";

import { Hover as MotionHover } from "@/components/animation/springs/hover";

import { useMobileHint } from "./device-hint";
import { restStyle } from "./robot-spring";

type HoverProps = ComponentProps<typeof MotionHover>;

/**
 * The engine's `<Hover>`, except on a phone: there is no hover on a touch
 * screen, so a phone (the proxy's phone form — `useMobileHint`) gets the plain
 * element at its `from` state — no spring created, started or hydrated. The
 * engine already ignores hovers on narrow screens; this skips building them.
 * Everyone else gets the engine's `<Hover>` unchanged. Swap an import to this
 * file; the vendored engine is untouched.
 */
export const Hover = forwardRef<HTMLElement, HoverProps>(
  function TouchAwareHover(props, ref) {
    const touch = useMobileHint();
    if (!touch) return <MotionHover ref={ref} {...props} />;
    const {
      tag = "div",
      children,
      from,
      to: _to,
      config: _config,
      delayIn: _delayIn,
      delayOut: _delayOut,
      enabled: _enabled,
      trigger: _trigger,
      disableOnMobile: _disableOnMobile,
      immediateOut: _immediateOut,
      style,
      ...rest
    } = props;
    // Through `ComponentType`, as `robot-spring` does (a dynamic intrinsic tag types its children as
    // `never` under @react-three/fiber's JSX augmentation).
    const Tag = tag as unknown as ComponentType<Record<string, unknown>>;
    return (
      <Tag {...rest} ref={ref} style={restStyle(from, style)}>
        {children}
      </Tag>
    );
  },
);
