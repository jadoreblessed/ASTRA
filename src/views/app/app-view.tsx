import { app } from "@/data/mocks/app";

import { AppShell } from "./app-shell";
import { GalaxyBackdrop } from "./galaxy-backdrop";

/**
 * The product app (`/app`) — the hero's galaxy turning behind ASTRA's console:
 * Explore, a basket's page, Assets, Create and Wallet, in the landing's own
 * language (deep space, frosted glass, Mulish, the coin mark, one pink accent).
 * Content is mock; nothing here places an order.
 */
export const AppView = () => (
  <div className="relative min-h-lvh w-full bg-background text-white">
    <GalaxyBackdrop />
    <AppShell content={app} />
  </div>
);
