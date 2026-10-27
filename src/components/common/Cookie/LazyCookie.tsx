// 📖 Docs: obsidian/frontend/components/common.md
"use client";

/**
 * Lazy client wrapper for the Cookie banner + preferences modal.
 *
 * `dynamic({ ssr: false })` keeps the Cookie banner / preferences modal /
 * zustand store out of the page's first-load JS manifest. The chunk only
 * fetches when this wrapper actually mounts on the client — i.e. for real
 * users. Bots / lab UAs aren't rendered (gated upstream by the layout)
 * so they never load the chunk at all (~3.7 KB gz off the bot bundle).
 */

import dynamic from "next/dynamic";
import { useLayoutEffect, useState } from "react";

import { isRobotView } from "@/components/common/robot-view";

const Cookie = dynamic(
  () => import("./Cookie").then((m) => ({ default: m.Cookie })),
  { ssr: false, loading: () => null },
);

export function LazyCookie() {
  // Robots get no consent banner (D-016): there is no visitor to ask. Decided
  // in a layout effect, before paint — returning null on the first render would
  // not match the server's bailout boundary (React #418) — from the server's
  // marker, because this layout renders before the page's robot module runs.
  const [robot, setRobot] = useState(false);
  useLayoutEffect(() => {
    if (isRobotView()) setRobot(true);
  }, []);
  return robot ? null : <Cookie />;
}
