"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/astra-api";

/**
 * The links that change at launch — the contract address and the socials —
 * set from /admin and read here, so the site picks them up without a redeploy.
 * Empty until set (or when the API is down): the site then shows "Coming soon"
 * for the CA and leaves out a social it has no link for.
 */

export interface SiteLinks {
  ca: string;
  x: string;
  telegram: string;
}

const EMPTY: SiteLinks = { ca: "", x: "", telegram: "" };

let cached: SiteLinks | null = null;
let pending: Promise<SiteLinks> | null = null;
const listeners = new Set<(l: SiteLinks) => void>();

export function loadSiteLinks(force = false): Promise<SiteLinks> {
  if (!force && cached) return Promise.resolve(cached);
  if (!force && pending) return pending;
  pending = api<{ links: SiteLinks }>("/api/site")
    .then((r) => ({ ...EMPTY, ...r.links }))
    .catch(() => cached ?? EMPTY)
    .then((l) => {
      cached = l;
      pending = null;
      listeners.forEach((fn) => fn(l));
      return l;
    });
  return pending;
}

/** The site's live links; one request per page load, shared by every caller. */
export function useSiteLinks(): SiteLinks {
  const [links, setLinks] = useState<SiteLinks>(cached ?? EMPTY);
  useEffect(() => {
    listeners.add(setLinks);
    void loadSiteLinks();
    return () => {
      listeners.delete(setLinks);
    };
  }, []);
  return links;
}
