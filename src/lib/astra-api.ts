/**
 * The website's client for the ASTRA backend (`server/`). Every call is JSON,
 * times out, and throws an `ApiError` with the server's own message — screens
 * show that text as is. When the API is unreachable the app keeps running on
 * its bundled mock content (`useAppData`).
 */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

const TOKEN_KEY = "astra.session";

export const session = {
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode: the session lasts as long as the tab */
    }
  },
};

export async function api<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const token = session.get();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
    });
  } catch {
    throw new ApiError("Can't reach ASTRA right now.", 0, "offline");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status}).`, res.status, data.code);
  return data as T;
}

/* ------------------------------------------------------------------ shapes */

export interface ApiConfig {
  cluster: string;
  trading: boolean;
  vault: string;
  maxOrderUsd: number;
  maxSlippageBps: number;
  maxBasketAssets: number;
  spendCapSol: number;
  spentSol: number;
  vaultSol?: number | null;
}

export interface ApiStats {
  tvl: string;
  tvlUsd: number;
  baskets: number;
  holders: number;
  listed: number;
}

export interface ApiUser {
  id: string;
  email: string | null;
  wallet: string;
  custodial: boolean;
}

export interface ApiPosition {
  basket: string;
  code: string;
  name: string;
  shares: number;
}

export interface QuoteLeg {
  symbol: string;
  in?: number;
  out?: number;
  minOut?: number;
  usd?: number;
  proceeds?: number;
  impactPct?: number;
  route?: string;
  error?: string;
}

export interface ApiQuote {
  side: "buy" | "sell" | "redeem";
  legs: QuoteLeg[];
  shares: number;
  nav: number;
  usdIn?: number;
  acquiredUsd?: number;
  valueUsd?: number;
  proceeds?: number;
  currency: "USDC" | "SOL";
  slippageBps: number;
  fresh: boolean;
  priceAgeSec: number | null;
  trading: boolean;
  swaps: number;
}

export interface ApiDeposit {
  to: string;
  mint: string;
  amount: number;
  amountRaw: string;
  decimals: number;
}

/* ------------------------------------------------------------ deposits */

/**
 * A wallet payment, from the moment it's signed until the API has seen it on
 * chain. Kept in localStorage so a closed tab or a dropped connection never
 * strands a paid order: the next visit hands the signature in again.
 */
const PENDING_KEY = "astra.pending-deposits";
type Pending = Record<string, string>;

const readPending = (): Pending => {
  try {
    return JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? "{}") as Pending;
  } catch {
    return {};
  }
};
const writePending = (p: Pending) => {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    /* private mode: this tab's own retries still run */
  }
};

export const pendingDeposits = {
  add: (orderId: string, signature: string) => writePending({ ...readPending(), [orderId]: signature }),
  remove: (orderId: string) => {
    const p = readPending();
    delete p[orderId];
    writePending(p);
  },
};

/** Hands a payment's signature to the API, waiting for the chain to show it (~1 min at most). */
export async function confirmDeposit(orderId: string, signature: string, tries = 20): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await api(`/api/orders/${orderId}/deposit`, { body: { signature } });
      pendingDeposits.remove(orderId);
      return;
    } catch (err) {
      const notYet = err instanceof ApiError && (err.status === 409 || err.status === 0) && /not found yet|reach/i.test(err.message);
      if (!notYet || i >= tries - 1) {
        if (!notYet) pendingDeposits.remove(orderId);
        throw err;
      }
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
}

/** Retries every payment a previous visit signed but never got confirmed. */
export async function resumeDeposits(): Promise<void> {
  for (const [orderId, signature] of Object.entries(readPending())) {
    await confirmDeposit(orderId, signature, 3).catch(() => undefined);
  }
}

/* ------------------------------------------------------------ base58 (signatures) */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// BigInt() rather than literals: the site still targets ES2017.
const ZERO = BigInt(0);
const EIGHT = BigInt(8);
const BASE = BigInt(58);

export function base58(bytes: Uint8Array): string {
  let n = ZERO;
  for (const b of bytes) n = (n << EIGHT) + BigInt(b);
  let out = "";
  while (n > ZERO) {
    out = ALPHABET[Number(n % BASE)] + out;
    n /= BASE;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}
