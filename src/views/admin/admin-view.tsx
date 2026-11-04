"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { AstraMark } from "@/components/ui/astra-mark";
import { FancyButton } from "@/components/ui/fancy-button";
import { api, ApiError } from "@/lib/astra-api";
import { loadSiteLinks, type SiteLinks } from "@/lib/site-links";

/**
 * /admin — the launch console. The contract address and social links; a switch
 * that stops new orders at once; the vault, the 0.05 SOL budget and the commission;
 * withdrawing that commission to the fixed treasury wallet, or spending it on the
 * $ASTRA buyback; and anything stuck, with its reason. One key (ADMIN_TOKEN on the
 * server), kept in this browser once it works.
 */

const KEY_STORE = "astra.admin-key";

const readKey = () => {
  try {
    return window.localStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
};
const writeKey = (k: string | null) => {
  try {
    if (k) window.localStorage.setItem(KEY_STORE, k);
    else window.localStorage.removeItem(KEY_STORE);
  } catch {
    /* private mode: the key lasts as long as the tab */
  }
};

interface Status {
  trading: boolean;
  paused: boolean;
  vault: string;
  vaultSol: number | null;
  freeSol: number | null;
  spentSol: number;
  capSol: number;
  feeBps: number;
  maxOrderUsd: number;
  treasury: string;
  fees: { USDC: number; SOL: number };
  burned: { mint: string; amount: number }[];
  stuckOrders: number;
  payouts: { id: string; order_id: string; reason: string; status: string; attempts: number; error: string | null }[];
  orders: { id: string; code: string; side: string; currency: string; amount: number; status: string; error: string | null; deposit_sig: string | null; wallet: string }[];
}

const FIELD =
  "h-[54px] w-full rounded-[14px] border border-white/[0.12] bg-white/[0.04] px-[18px] font-mulish text-[16px] text-white outline-none placeholder:text-white/30 focus:border-signal-glow/70";

const CARD = "flex w-full flex-col gap-[20px] rounded-[28px] border border-white/[0.1] bg-surface-panel p-[32px] max-hero-xs:p-[22px]";

const Field = ({ label, hint, children }: { label: string; hint: string; children: ReactNode }) => (
  <label className="flex flex-col gap-[8px]">
    <span className="font-mulish text-[15px] text-white/80">{label}</span>
    {children}
    <span className="font-mulish text-[13px] text-white/45">{hint}</span>
  </label>
);

const Fact = ({ k, v, warn }: { k: string; v: ReactNode; warn?: boolean }) => (
  <div className="flex items-baseline justify-between gap-[16px] font-mulish text-[15px]">
    <dt className="text-white/50">{k}</dt>
    <dd className={`m-0 min-w-0 truncate text-right ${warn ? "text-signal-ring" : "text-white/90"}`}>{v}</dd>
  </div>
);

const sol = (v: number | null) => (v === null ? "can't read" : `${v.toFixed(4)} SOL`);

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export const AdminView = () => {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [links, setLinks] = useState<SiteLinks>({ ca: "", x: "", telegram: "" });
  const [status, setStatus] = useState<Status | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(<T,>(path: string, k: string, body: unknown = {}) => api<T>(path, { body, headers: { "x-admin-token": k }, timeoutMs: 120_000 }), []);

  const refreshStatus = useCallback(
    async (k: string) => {
      setStatus(await call<Status>("/api/admin/status", k));
    },
    [call],
  );

  const enter = useCallback(
    async (k: string) => {
      setBusy(true);
      setNote(null);
      try {
        await call("/api/admin/check", k);
        writeKey(k);
        setKey(k);
        setAuthed(true);
        setLinks(await loadSiteLinks(true));
        await refreshStatus(k);
      } catch (err) {
        writeKey(null);
        setAuthed(false);
        setNote(message(err, "Couldn't reach the server."));
      } finally {
        setBusy(false);
      }
    },
    [call, refreshStatus],
  );

  useEffect(() => {
    const k = readKey();
    if (k) void enter(k);
  }, [enter]);

  useEffect(() => {
    if (!authed) return;
    const id = window.setInterval(() => void refreshStatus(key).catch(() => undefined), 10_000);
    return () => window.clearInterval(id);
  }, [authed, key, refreshStatus]);

  const run = async (what: () => Promise<string>, failed: string) => {
    setBusy(true);
    setNote(null);
    try {
      setNote(await what());
      await refreshStatus(key);
    } catch (err) {
      setNote(message(err, failed));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const r = await call<{ links: SiteLinks }>("/api/admin/site", key, links);
      setLinks(r.links);
      await loadSiteLinks(true);
      return "Saved. The site shows it on the next page load.";
    }, "Couldn't save.");

  const togglePause = (paused: boolean) =>
    run(async () => {
      await call("/api/admin/pause", key, { paused });
      return paused ? "Paused: new orders are refused. Refunds and exits keep working." : "Trading is back on.";
    }, "Couldn't switch it.");

  const spendFees = (action: "withdraw" | "buyback", currency: "USDC" | "SOL") => {
    const ask =
      action === "withdraw"
        ? `Send all accrued ${currency} commission to ${status?.treasury}?`
        : `Spend all accrued ${currency} commission on $ASTRA and burn it? This can't be undone.`;
    if (!window.confirm(ask)) return;
    void run(async () => {
      await call(`/api/admin/${action}`, key, { currency });
      return action === "withdraw" ? "Sent to the treasury." : "Bought back and burned.";
    }, "That didn't go through.");
  };

  const retry = () =>
    run(async () => {
      const r = await call<{ sent: number; left: number }>("/api/admin/retry-payouts", key);
      return `Tried ${r.sent}. ${r.left} still waiting.`;
    }, "Couldn't retry.");

  const set = (k: keyof SiteLinks) => (e: React.ChangeEvent<HTMLInputElement>) => setLinks((l) => ({ ...l, [k]: e.target.value }));

  const low = status?.vaultSol !== null && status !== null && (status.vaultSol ?? 0) < 0.002;

  return (
    <main className="flex min-h-[100svh] justify-center bg-background px-[20px] py-[60px]">
      <div className="flex w-full max-w-[600px] flex-col gap-[20px]">
        <div className="flex items-center gap-[14px]">
          <AstraMark size={40} live />
          <h1 className="m-0 font-mulish text-[30px] leading-none font-light text-white">ASTRA admin</h1>
        </div>

        {note && (
          <p role="status" className="m-0 rounded-[14px] border border-white/[0.1] bg-white/[0.04] px-[18px] py-[12px] font-mulish text-[15px] leading-[1.45] text-white/85">
            {note}
          </p>
        )}

        {!authed ? (
          <section className={CARD}>
            <form
              className="flex flex-col gap-[18px]"
              onSubmit={(e) => {
                e.preventDefault();
                void enter(key);
              }}
            >
              <Field label="Admin key" hint="ADMIN_TOKEN from the server's env. Kept in this browser once it works.">
                <input className={FIELD} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste the key" />
              </Field>
              <FancyButton size="lg" full onClick={() => void enter(key)}>
                {busy ? "Checking…" : "Enter"}
              </FancyButton>
            </form>
          </section>
        ) : (
          <>
            {status && (
              <section className={CARD} aria-label="Trading">
                <h2 className="m-0 font-mulish text-[20px] font-light text-white">Trading</h2>
                <dl className="m-0 flex flex-col gap-[10px]">
                  <Fact k="State" v={!status.trading ? "Off (TRADING_ENABLED)" : status.paused ? "Paused" : "Open"} warn={!status.trading || status.paused} />
                  <Fact k="Largest order" v={`$${status.maxOrderUsd}`} />
                  <Fact k="Commission" v={`${(status.feeBps / 100).toFixed(2)}%`} />
                </dl>
                {status.trading && (
                  <FancyButton size="lg" variant={status.paused ? "primary" : "ghost"} full onClick={() => void togglePause(!status.paused)}>
                    {status.paused ? "Resume trading" : "Pause new orders"}
                  </FancyButton>
                )}
              </section>
            )}

            <section className={CARD} aria-label="Links">
              <h2 className="m-0 font-mulish text-[20px] font-light text-white">Links</h2>
              <Field label="Contract address (CA)" hint={links.ca ? "Shown in the hero and the app, tap to copy." : "Empty: the site says “Coming soon”."}>
                <input className={`${FIELD} font-mono text-[15px]`} value={links.ca} onChange={set("ca")} placeholder="Paste the $ASTRA mint address" spellCheck={false} />
              </Field>
              <Field label="X (Twitter)" hint="The X button in the hero, the footer and the app.">
                <input className={FIELD} value={links.x} onChange={set("x")} placeholder="https://x.com/yourhandle" spellCheck={false} />
              </Field>
              <Field label="Telegram" hint="Footer link. Leave empty to hide it.">
                <input className={FIELD} value={links.telegram} onChange={set("telegram")} placeholder="https://t.me/yourgroup" spellCheck={false} />
              </Field>
              <FancyButton size="lg" full onClick={() => void save()}>
                {busy ? "Saving…" : "Save"}
              </FancyButton>
            </section>

            {status && (
              <section className={CARD} aria-label="Money">
                <h2 className="m-0 font-mulish text-[20px] font-light text-white">Money</h2>
                <dl className="m-0 flex flex-col gap-[10px]">
                  <Fact k="Vault" v={<span className="font-mono text-[13px]">{status.vault}</span>} />
                  <Fact k="Vault SOL" v={sol(status.vaultSol)} warn={low} />
                  <Fact k="Free for fees and rent" v={sol(status.freeSol)} warn={low} />
                  <Fact k="Paid by the platform" v={`${status.spentSol.toFixed(4)} of ${status.capSol} SOL`} />
                  <Fact k="Commission, USDC" v={status.fees.USDC.toFixed(4)} />
                  <Fact k="Commission, SOL" v={status.fees.SOL.toFixed(6)} />
                  <Fact k="Treasury" v={status.treasury ? <span className="font-mono text-[13px]">{status.treasury}</span> : "Not set: TREASURY_WALLET"} warn={!status.treasury} />
                  {status.burned.map((b) => (
                    <Fact key={b.mint} k="$ASTRA burned" v={b.amount.toLocaleString("en-US")} />
                  ))}
                </dl>
                {low && (
                  <p className="m-0 font-mulish text-[14px] leading-[1.45] text-signal-ring">
                    The vault is nearly empty, and orders stop below about 0.001 SOL. Send it up to 0.05 SOL.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-[10px]">
                  {(["USDC", "SOL"] as const).map((c) => (
                    <FancyButton key={c} variant="ghost" full onClick={() => spendFees("withdraw", c)}>
                      Withdraw {c}
                    </FancyButton>
                  ))}
                  {(["USDC", "SOL"] as const).map((c) => (
                    <FancyButton key={c} variant="ghost" full onClick={() => spendFees("buyback", c)}>
                      Buy back with {c}
                    </FancyButton>
                  ))}
                </div>
              </section>
            )}

            {status && (status.payouts.length > 0 || status.stuckOrders > 0) && (
              <section className={CARD} aria-label="Needs attention">
                <h2 className="m-0 font-mulish text-[20px] font-light text-signal-ring">Needs attention</h2>
                {status.stuckOrders > 0 && (
                  <p className="m-0 font-mulish text-[15px] leading-[1.45] text-white/80">
                    {status.stuckOrders} order(s) stopped mid-execution. They aren&rsquo;t retried on their own: check the list below and the server log.
                  </p>
                )}
                <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
                  {status.payouts.map((p) => (
                    <li key={p.id} className="font-mulish text-[14px] leading-[1.45] text-white/80">
                      <span className="font-mono text-[13px] text-white/50">{p.order_id}</span> {p.reason}: {p.status}, tried {p.attempts}
                      {p.error ? ` — ${p.error}` : ""}
                    </li>
                  ))}
                </ul>
                <FancyButton size="lg" variant="ghost" full onClick={() => void retry()}>
                  Retry everything owed
                </FancyButton>
              </section>
            )}

            {status && status.orders.length > 0 && (
              <section className={CARD} aria-label="Recent orders">
                <h2 className="m-0 font-mulish text-[20px] font-light text-white">Recent orders</h2>
                <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
                  {status.orders.map((o) => (
                    <li key={o.id} className="flex flex-col gap-[2px] font-mulish text-[14px] text-white/85">
                      <span className="flex justify-between gap-[12px]">
                        <span>
                          {o.side} ${o.code} · {o.amount} {o.side === "buy" ? o.currency : "shares"}
                        </span>
                        {o.deposit_sig ? (
                          <a className="shrink-0 text-white/60 hover:text-white" href={`https://solscan.io/tx/${o.deposit_sig}`} target="_blank" rel="noopener noreferrer">
                            {o.status}
                          </a>
                        ) : (
                          <span className="shrink-0 text-white/60">{o.status}</span>
                        )}
                      </span>
                      {o.error && <span className="text-signal-ring">{o.error}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <FancyButton
              variant="ghost"
              full
              onClick={() => {
                writeKey(null);
                setAuthed(false);
                setKey("");
                setStatus(null);
              }}
            >
              Log out
            </FancyButton>
          </>
        )}
      </div>
    </main>
  );
};
