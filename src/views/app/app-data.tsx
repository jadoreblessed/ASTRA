"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { registerIcons } from "@/components/common/asset-logo";
import { api, session, type ApiConfig, type ApiPosition, type ApiStats, type ApiUser } from "@/lib/astra-api";
import type { AppContent, AppStat, Asset, Basket } from "@/data/mocks/app";

/**
 * The app's data: live from the backend when it answers, the bundled mock
 * content when it doesn't — so the screens never go blank, and the moment the
 * API is up every price, chart, holder count and basket is the real one.
 *
 * Also owns the session (bearer token in localStorage) and the logged-in user.
 * Market data refreshes every 30s.
 */

const REFRESH_MS = 30_000;

interface AppData {
  content: AppContent;
  /** True once real data has arrived from the API. */
  live: boolean;
  config: ApiConfig | null;
  user: ApiUser | null;
  positions: ApiPosition[];
  asset: (symbol: string) => Asset | undefined;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Adds a basket the user just created, without waiting for the next refresh. */
  addBasket: (b: Basket) => void;
}

const Ctx = createContext<AppData | null>(null);

export const useAppData = (): AppData => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppData outside AppDataProvider");
  return v;
};

const statsFrom = (s: ApiStats): AppStat[] => {
  const tvl = s.tvlUsd;
  const [value, suffix] = tvl >= 1e6 ? [tvl / 1e6, "M"] : tvl >= 1e3 ? [tvl / 1e3, "K"] : [tvl, ""];
  return [
    { label: "Value locked", value: Number(value.toFixed(2)), prefix: "$", suffix },
    { label: "Baskets", value: s.baskets, prefix: "", suffix: "" },
    { label: "Assets listed", value: s.listed, prefix: "", suffix: "" },
  ];
};

/** A chart needs two points; a basket younger than a day gets a flat line at its price. */
const withHistory = (b: Basket): Basket => (b.history.length >= 2 ? b : { ...b, history: [b.price, b.price] });

export const AppDataProvider = ({ initial, children }: { initial: AppContent; children: ReactNode }) => {
  const [content, setContent] = useState<AppContent>(initial);
  const [live, setLive] = useState(false);
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [positions, setPositions] = useState<ApiPosition[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [cfg, stats, assets, baskets] = await Promise.all([
        api<ApiConfig>("/api/config"),
        api<ApiStats>("/api/stats"),
        api<{ assets: Asset[] }>("/api/assets"),
        api<{ baskets: Basket[] }>("/api/baskets"),
      ]);
      if (assets.assets.length === 0) return; // still syncing — keep what we show
      registerIcons(assets.assets);
      setConfig(cfg);
      setContent((c) => ({
        ...c,
        stats: statsFrom(stats),
        assets: assets.assets,
        baskets: baskets.baskets.filter((b) => b.price > 0).map(withHistory),
      }));
      setLive(true);
    } catch {
      /* offline: keep the current content */
    }
  }, []);

  const loadMe = useCallback(async () => {
    if (!session.get()) {
      setUser(null);
      setPositions([]);
      return;
    }
    try {
      const me = await api<{ user: ApiUser; positions: ApiPosition[] }>("/api/me");
      setUser(me.user);
      setPositions(me.positions);
    } catch {
      session.set(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void loadMe();
    const id = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh, loadMe]);

  const login = useCallback(
    async (token: string) => {
      session.set(token);
      await loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { body: {} }).catch(() => undefined);
    session.set(null);
    setUser(null);
    setPositions([]);
  }, []);

  const addBasket = useCallback((b: Basket) => {
    setContent((c) => ({ ...c, baskets: [...c.baskets.filter((x) => x.id !== b.id), withHistory(b)] }));
  }, []);

  const bySymbol = useMemo(() => new Map(content.assets.map((a) => [a.symbol, a])), [content.assets]);
  const asset = useCallback((s: string) => bySymbol.get(s), [bySymbol]);

  const value = useMemo<AppData>(
    () => ({ content, live, config, user, positions, asset, login, logout, refresh: async () => { await refresh(); await loadMe(); }, addBasket }),
    [content, live, config, user, positions, asset, login, logout, refresh, loadMe, addBasket],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
