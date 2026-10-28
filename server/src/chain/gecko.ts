import { config } from "../config.js";

/**
 * GeckoTerminal — daily closes for the charts. Free and keyless but tightly
 * rate-limited, so calls are paced and retried (`pace`). A token's most
 * liquid pool stands in for its price.
 */

const TIMEOUT_MS = 15_000;
let last = 0;

/** Waits so calls land at most one every 6s — the free tier is stricter than its docs. */
async function pace(): Promise<void> {
  const wait = last + 6_000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

async function get<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await pace();
    const res = await fetch(`${config.GECKO_API}${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`gecko ${path.split("?")[0]} → ${res.status}`);
    return (await res.json()) as T;
  }
}

/** [unix seconds, close] per day, oldest first, up to `days`. */
export async function dailyCloses(mint: string, days = 120): Promise<[number, number][]> {
  const pools = await get<{ data: { id: string }[] }>(`/networks/solana/tokens/${mint}/pools?page=1`);
  const pool = pools.data[0]?.id?.replace(/^solana_/, "");
  if (!pool) return [];
  const ohlcv = await get<{ data: { attributes: { ohlcv_list: number[][] } } }>(
    `/networks/solana/pools/${pool}/ohlcv/day?limit=${days}&currency=usd&token=${mint}`,
  );
  return ohlcv.data.attributes.ohlcv_list
    .map((row) => [row[0], row[4]] as [number, number])
    .filter(([, close]) => Number.isFinite(close) && close > 0)
    .sort((a, b) => a[0] - b[0]);
}
