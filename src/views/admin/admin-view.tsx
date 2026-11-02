"use client";

import { useEffect, useState, type ReactNode } from "react";

import { AstraMark } from "@/components/ui/astra-mark";
import { FancyButton } from "@/components/ui/fancy-button";
import { api, ApiError } from "@/lib/astra-api";
import { loadSiteLinks, type SiteLinks } from "@/lib/site-links";

/**
 * /admin — set the contract address and the social links the site shows.
 * One key (ADMIN_TOKEN on the server), kept in this browser after it works.
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

const FIELD =
  "h-[54px] w-full rounded-[14px] border border-white/[0.12] bg-white/[0.04] px-[18px] font-mulish text-[16px] text-white outline-none placeholder:text-white/30 focus:border-[#ff5fa8]/70";

const Field = ({ label, hint, children }: { label: string; hint: string; children: ReactNode }) => (
  <label className="flex flex-col gap-[8px]">
    <span className="font-mulish text-[15px] text-white/80">{label}</span>
    {children}
    <span className="font-mulish text-[13px] text-white/45">{hint}</span>
  </label>
);

export const AdminView = () => {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [links, setLinks] = useState<SiteLinks>({ ca: "", x: "", telegram: "" });
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enter = async (k: string) => {
    setBusy(true);
    setNote(null);
    try {
      await api("/api/admin/check", { body: {}, headers: { "x-admin-token": k } });
      writeKey(k);
      setKey(k);
      setAuthed(true);
      setLinks(await loadSiteLinks(true));
    } catch (err) {
      writeKey(null);
      setAuthed(false);
      setNote(err instanceof ApiError ? err.message : "Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const k = readKey();
    if (k) void enter(k);
  }, []);

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await api<{ links: SiteLinks }>("/api/admin/site", { body: links, headers: { "x-admin-token": key } });
      setLinks(r.links);
      await loadSiteLinks(true);
      setNote("Saved. The site shows it on the next page load.");
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof SiteLinks) => (e: React.ChangeEvent<HTMLInputElement>) => setLinks((l) => ({ ...l, [k]: e.target.value }));

  return (
    <main className="flex min-h-[100svh] items-center justify-center bg-background px-[20px] py-[60px]">
      <div className="flex w-full max-w-[560px] flex-col gap-[28px] rounded-[28px] border border-white/[0.1] bg-[#0a0e22] p-[36px] max-hero-xs:p-[24px]">
        <div className="flex items-center gap-[14px]">
          <AstraMark size={40} live />
          <h1 className="m-0 font-mulish text-[30px] leading-none font-light text-white">ASTRA admin</h1>
        </div>

        {!authed ? (
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
        ) : (
          <div className="flex flex-col gap-[22px]">
            <Field label="Contract address (CA)" hint={links.ca ? "Shown in the hero and the app, tap to copy." : "Empty → the site says “Coming soon”."}>
              <input className={`${FIELD} font-mono text-[15px]`} value={links.ca} onChange={set("ca")} placeholder="Paste the $ASTRA mint address" spellCheck={false} />
            </Field>
            <Field label="X (Twitter)" hint="The X button in the hero, the footer and the app.">
              <input className={FIELD} value={links.x} onChange={set("x")} placeholder="https://x.com/yourhandle" spellCheck={false} />
            </Field>
            <Field label="Telegram" hint="Footer link. Leave empty to hide it.">
              <input className={FIELD} value={links.telegram} onChange={set("telegram")} placeholder="https://t.me/yourgroup" spellCheck={false} />
            </Field>
            <div className="flex gap-[12px] max-hero-xs:flex-col">
              <FancyButton size="lg" full onClick={() => void save()}>
                {busy ? "Saving…" : "Save"}
              </FancyButton>
              <FancyButton
                size="lg"
                variant="ghost"
                full
                onClick={() => {
                  writeKey(null);
                  setAuthed(false);
                  setKey("");
                }}
              >
                Log out
              </FancyButton>
            </div>
          </div>
        )}

        {note && (
          <p role="status" className="m-0 font-mulish text-[15px] leading-[1.45] text-white/80">
            {note}
          </p>
        )}
      </div>
    </main>
  );
};
