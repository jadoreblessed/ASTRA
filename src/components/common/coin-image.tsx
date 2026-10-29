"use client";

import { useCallback, useState, type ReactNode } from "react";

/**
 * A token's own logo in a coin — with a lettered coin behind it as the
 * fallback, shown if the image never arrives (an IPFS gateway timing out, a
 * project moving its file). The image fades in once it has loaded.
 *
 * Token icons live wherever each project put them, some on IPFS gateways that
 * have since shut down (nftstorage.link). So every source is first rewritten to
 * a live gateway, then fetched through wsrv.nl — a public caching image proxy
 * that serves it resized and fast, so a dozen coins don't wait on a dozen hosts.
 */

const NFT_STORAGE = /^https:\/\/([a-z0-9]+)\.ipfs\.nftstorage\.link\/?(.*)$/i;
const IPFS_PATH = /^https:\/\/[^/]+\/ipfs\/(.+)$/i;

export function iconUrl(src: string, size: number): string {
  let u = src;
  const nft = u.match(NFT_STORAGE);
  if (nft) u = `https://4everland.io/ipfs/${nft[1]}${nft[2] ? `/${nft[2]}` : ""}`;
  const ipfs = u.match(IPFS_PATH);
  if (ipfs) u = `https://4everland.io/ipfs/${ipfs[1]}`;
  // Two buckets only, so every coin of a symbol shares one cached file.
  const px = size * 2 <= 64 ? 64 : 128;
  return `https://wsrv.nl/?url=${encodeURIComponent(u)}&w=${px}&h=${px}&fit=cover&output=webp`;
}

/** Warms the browser cache with every icon in both buckets — call once per page. */
const warmed = new Set<string>();
export function preloadIcons(srcs: string[]): void {
  if (typeof window === "undefined") return;
  for (const src of srcs) {
    for (const size of [32, 64]) {
      const url = iconUrl(src, size);
      if (warmed.has(url)) continue;
      warmed.add(url);
      const img = new Image();
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = url;
    }
  }
}
export const CoinImage = ({ src, size, fallback }: { src: string; size: number; fallback: ReactNode }) => {
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  // A cached icon can finish before hydration attaches onLoad — read its state on mount instead.
  const settle = useCallback((img: HTMLImageElement | null) => {
    if (!img || !img.complete) return;
    setState(img.naturalWidth > 0 ? "ok" : "failed");
  }, []);
  if (state === "failed") return <>{fallback}</>;
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size, background: "rgb(11 15 34)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.13)" }}
    >
      {state === "loading" && <span className="absolute inset-0">{fallback}</span>}
      {/* eslint-disable-next-line @next/next/no-img-element -- remote token icons, tiny, many hosts */}
      <img
        ref={settle}
        src={iconUrl(src, size)}
        alt=""
        width={size}
        height={size}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setState("ok")}
        onError={() => setState("failed")}
        className="relative size-full object-cover"
        style={{ opacity: state === "ok" ? 1 : 0 }}
      />
    </span>
  );
};
