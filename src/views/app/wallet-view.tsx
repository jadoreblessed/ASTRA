"use client";

import { useState, type FormEvent } from "react";

import { AstraMark } from "@/components/ui/astra-mark";
import { LogoStack } from "@/components/common/asset-logo";
import { FancyButton } from "@/components/ui/fancy-button";
import { api, ApiError } from "@/lib/astra-api";
import { installUrl, provider, signIn, type WalletName } from "@/lib/wallet";
import { Press } from "@/components/ui/press";

import { useAppData } from "./app-data";
import { GLASS, Reveal } from "./ui";

/**
 * Wallet — log in, after the reference app's: your email is your wallet (a
 * six-digit code, and a Solana wallet is made for you), or bring Phantom or
 * Solflare and sign a challenge. Once in: your address, what you hold, how to
 * fund it, and — for an email wallet — exporting its key, which only works in
 * the first minutes after a login. Beside it, what the app does.
 */

const FEATURES: {
  title: string;
  body: string;
  logos?: { symbol: string; logo?: string }[];
}[] = [
  {
    title: "Your email is your wallet",
    logos: [
      { symbol: "Email", logo: "gmail" },
      { symbol: "SOL", logo: "solana" },
    ],
    body: "Type your email and the code we send, and a Solana wallet is made for you. Its keys stay yours to export.",
  },
  {
    title: "Slide to confirm",
    body: "Buying, selling and redeeming take a full slide of the knob — never a stray tap. Let go early and it springs back.",
  },
  {
    title: "USDC or SOL, your call",
    logos: [
      { symbol: "USDC", logo: "usdc" },
      { symbol: "SOL", logo: "solana" },
    ],
    body: "Pick your default once: buys are paid in it, sales pay out in it. Any single trade can still switch.",
  },
  {
    title: "Redeem any time",
    body: "Burn a share and the vault sends you the exact tokens it stands for. No one can switch that off.",
  },
];

const INPUT =
  "h-[52px] rounded-full border border-white/[0.12] bg-white/[0.04] px-[20px] font-mulish text-[15px] text-white outline-none placeholder:text-white/35 focus:border-accent-400/60";

const message = (err: unknown) =>
  err instanceof ApiError || err instanceof Error
    ? err.message
    : "Something went wrong.";

const Copy = ({ text }: { text: string }) => {
  const [done, setDone] = useState(false);
  return (
    <Press mode="grow" className="shrink-0">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1400);
          });
        }}
        className="shrink-0 rounded-full border border-white/[0.12] px-[12px] py-[6px] font-mulish text-[13px] text-white/70 hover:text-white"
      >
        {done ? "Copied" : "Copy"}
      </button>
    </Press>
  );
};

const LoginCard = () => {
  const { live, login } = useAppData();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const offline = () =>
    setNote("Can't reach ASTRA right now — try again in a moment.");

  const onEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (!live) return offline();
    setBusy(true);
    try {
      const r = await api<{ sent: boolean; devCode?: string }>(
        "/api/auth/email/start",
        { body: { email } },
      );
      setDevCode(r.devCode ?? null);
      setStep("code");
      setNote(`We sent a code to ${email}.`);
    } catch (err) {
      setNote(message(err));
    } finally {
      setBusy(false);
    }
  };

  const onCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { token } = await api<{ token: string }>("/api/auth/email/verify", {
        body: { email, code },
      });
      await login(token);
    } catch (err) {
      setNote(message(err));
    } finally {
      setBusy(false);
    }
  };

  const onWallet = async (name: WalletName) => {
    if (!live) return offline();
    if (!provider(name)) {
      window.open(installUrl(name), "_blank", "noopener,noreferrer");
      return setNote(`${name} isn't installed — opening its download page.`);
    }
    setBusy(true);
    try {
      await login(await signIn(name));
    } catch (err) {
      setNote(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Reveal
      y={24}
      className={`${GLASS} mx-auto flex w-full max-w-[460px] flex-col gap-[22px] p-[30px]`}
    >
      <AstraMark size={60} live />
      <div className="flex flex-col gap-[10px]">
        <h1 className="m-0 font-mulish text-[34px] leading-none font-light text-white">
          Log in to ASTRA
        </h1>
        <p className="m-0 font-mulish text-[15px] leading-[1.5] text-white/60">
          Baskets of stocks, crypto and memecoins. Log in and you have a wallet
          in seconds.
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={onEmail} className="flex flex-col gap-[12px]">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            aria-label="Email"
            className={INPUT}
          />
          <FancyButton type="submit" variant="primary" size="lg" full>
            {busy ? "Sending…" : "Continue with email"}
          </FancyButton>
        </form>
      ) : (
        <form onSubmit={onCode} className="flex flex-col gap-[12px]">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="6-digit code"
            aria-label="Login code"
            className={`${INPUT} text-center font-mono tracking-[0.4em]`}
          />
          {devCode && (
            <button
              type="button"
              onClick={() => setCode(devCode)}
              className="font-mulish text-[13px] text-white/45 hover:text-white"
            >
              Local dev, no mail set up — your code is{" "}
              <span className="font-mono text-accent-200">{devCode}</span>
            </button>
          )}
          <FancyButton type="submit" variant="primary" size="lg" full>
            {busy ? "Checking…" : "Log in"}
          </FancyButton>
          <Press mode="nudge-left" className="self-center">
            <button
              type="button"
              onClick={() => setStep("email")}
              className="font-mulish text-[14px] text-white/50 hover:text-white"
            >
              Use a different email
            </button>
          </Press>
        </form>
      )}

      <div className="flex items-center gap-[12px] font-mulish text-[13px] text-white/40">
        <span className="h-px flex-1 bg-white/[0.08]" />
        or connect a wallet
        <span className="h-px flex-1 bg-white/[0.08]" />
      </div>

      <div className="grid grid-cols-2 gap-[10px]">
        {(["Phantom", "Solflare"] as const).map((w) => (
          <FancyButton
            key={w}
            variant="ghost"
            icon="none"
            full
            onClick={() => void onWallet(w)}
          >
            {w}
          </FancyButton>
        ))}
      </div>

      <p
        className="m-0 min-h-[20px] text-center font-mulish text-[14px] text-accent-300"
        role="status"
      >
        {note ?? "A Solana wallet is made for you. Your keys stay yours."}
      </p>
    </Reveal>
  );
};

const AccountCard = () => {
  const { user, positions, logout } = useAppData();
  const [secret, setSecret] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (!user) return null;

  const onExport = async () => {
    try {
      const r = await api<{ secretKey: string }>("/api/me/export", {
        body: {},
      });
      setSecret(r.secretKey);
    } catch (err) {
      setNote(message(err));
    }
  };

  return (
    <Reveal
      y={24}
      className={`${GLASS} mx-auto flex w-full max-w-[460px] flex-col gap-[22px] p-[30px]`}
    >
      <div className="flex items-center gap-[16px]">
        <AstraMark size={52} />
        <div className="flex min-w-0 flex-col gap-[6px]">
          <span className="font-mulish text-[26px] leading-none font-light text-white">
            You&rsquo;re in
          </span>
          <span className="truncate font-mulish text-[14px] text-white/55">
            {user.custodial
              ? `${user.email} · ASTRA wallet`
              : "Your own wallet"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-[8px] rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-[16px]">
        <span className="font-mulish text-[13px] text-white/50">
          Wallet address
        </span>
        <span className="flex items-center justify-between gap-[10px]">
          <span className="truncate font-mono text-[14px] text-white">
            {user.wallet}
          </span>
          <Copy text={user.wallet} />
        </span>
        {user.custodial && (
          <span className="font-mulish text-[13px] leading-[1.45] text-white/45">
            Send SOL (for network fees) and USDC here to buy baskets.
          </span>
        )}
      </div>

      <div className="flex flex-col gap-[10px]">
        <span className="font-mulish text-[14px] text-white/50">
          Your baskets
        </span>
        {positions.length === 0 ? (
          <span className="font-mulish text-[15px] text-white/70">
            None yet — pick one on Explore.
          </span>
        ) : (
          positions.map((p) => (
            <span
              key={p.basket}
              className="flex items-center justify-between font-mulish text-[15px] text-white"
            >
              {p.name}
              <span className="font-mono text-[14px] text-white/80">
                {p.shares.toFixed(4)} {p.code}
              </span>
            </span>
          ))
        )}
      </div>

      {user.custodial &&
        (secret ? (
          <div className="flex flex-col gap-[8px] rounded-[18px] border border-signal-ring/30 bg-signal-glow/[0.06] p-[16px]">
            <span className="font-mulish text-[13px] text-signal-ring">
              Anyone with this key controls the wallet. Store it offline.
            </span>
            <span className="font-mono text-[12px] break-all text-white/90">
              {secret}
            </span>
            <Copy text={secret} />
          </div>
        ) : (
          <FancyButton
            variant="ghost"
            icon="none"
            full
            onClick={() => void onExport()}
          >
            Export private key
          </FancyButton>
        ))}

      <FancyButton variant="ghost" full onClick={() => void logout()}>
        Log out
      </FancyButton>
      {note && (
        <p
          className="m-0 text-center font-mulish text-[14px] text-accent-300"
          role="status"
        >
          {note}
        </p>
      )}
    </Reveal>
  );
};

export const WalletView = () => {
  const { user } = useAppData();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-[40px] max-pad-sm:grid-cols-1">
      {user ? <AccountCard /> : <LoginCard />}

      <ul className="m-0 grid list-none grid-cols-2 gap-[14px] p-0 max-hero-sm:grid-cols-1">
        {FEATURES.map((f, i) => (
          <Reveal
            key={f.title}
            tag="li"
            delay={140 + i * 80}
            className={`${GLASS} flex flex-col gap-[10px] p-[22px]`}
          >
            <span className="flex items-center justify-between gap-[10px]">
              <span className="font-mono text-[14px] text-accent-300">
                {String(i + 1).padStart(2, "0")}
              </span>
              {f.logos && <LogoStack items={f.logos} size={28} />}
            </span>
            <span className="font-mulish text-[19px] leading-tight text-white">
              {f.title}
            </span>
            <span className="font-mulish text-[14px] leading-[1.5] text-white/55">
              {f.body}
            </span>
          </Reveal>
        ))}
      </ul>
    </div>
  );
};
