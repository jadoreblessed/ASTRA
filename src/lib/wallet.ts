import { api, base58, type ApiDeposit } from "@/lib/astra-api";

/**
 * Browser wallets (Phantom, Solflare): sign in by signing a plain-text
 * challenge, and pay an order with one plain transfer into the vault — a
 * transaction the user can read in their wallet before approving. The Solana
 * libraries load only when a payment is actually made.
 */

interface Provider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toBase58(): string } | null;
  connect(): Promise<{ publicKey: { toBase58(): string } } | void>;
  signMessage(msg: Uint8Array, display?: string): Promise<{ signature: Uint8Array } | Uint8Array>;
  signAndSendTransaction(tx: unknown): Promise<{ signature: string }>;
}

type WalletWindow = Window & {
  phantom?: { solana?: Provider };
  solflare?: Provider;
  solana?: Provider;
};

export type WalletName = "Phantom" | "Solflare";

export function provider(name: WalletName): Provider | null {
  const w = window as WalletWindow;
  if (name === "Phantom") return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null);
  return w.solflare ?? null;
}

export const installUrl = (name: WalletName) => (name === "Phantom" ? "https://phantom.com/download" : "https://solflare.com/download");

/** Connects, signs the server's challenge, and returns a session token. */
export async function signIn(name: WalletName): Promise<string> {
  const p = provider(name);
  if (!p) throw new Error(`${name} isn't installed in this browser.`);
  const res = await p.connect();
  const key = (res && "publicKey" in res ? res.publicKey : p.publicKey)?.toBase58();
  if (!key) throw new Error(`${name} didn't share an address.`);
  const { nonce, message } = await api<{ nonce: string; message: string }>("/api/auth/wallet/nonce", { body: { wallet: key } });
  const signed = await p.signMessage(new TextEncoder().encode(message), "utf8");
  const signature = signed instanceof Uint8Array ? signed : signed.signature;
  const { token } = await api<{ token: string }>("/api/auth/wallet/verify", {
    body: { wallet: key, nonce, signature: base58(signature) },
  });
  return token;
}

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";

/** Pays an order's deposit from the connected wallet; returns the signature. */
export async function payDeposit(name: WalletName, d: ApiDeposit): Promise<string> {
  const p = provider(name);
  if (!p) throw new Error(`${name} isn't installed in this browser.`);
  await p.connect();
  const from = p.publicKey?.toBase58();
  if (!from) throw new Error(`${name} isn't connected.`);

  const web3 = await import("@solana/web3.js");
  const spl = await import("@solana/spl-token");
  const conn = new web3.Connection(RPC, "confirmed");
  const owner = new web3.PublicKey(from);
  const vault = new web3.PublicKey(d.to);
  const tx = new web3.Transaction();

  if (d.mint === "SOL") {
    tx.add(web3.SystemProgram.transfer({ fromPubkey: owner, toPubkey: vault, lamports: BigInt(d.amountRaw) }));
  } else {
    const mint = new web3.PublicKey(d.mint);
    const info = await conn.getAccountInfo(mint);
    const program = info?.owner.equals(spl.TOKEN_2022_PROGRAM_ID) ? spl.TOKEN_2022_PROGRAM_ID : spl.TOKEN_PROGRAM_ID;
    const src = spl.getAssociatedTokenAddressSync(mint, owner, false, program);
    const dst = spl.getAssociatedTokenAddressSync(mint, vault, true, program);
    tx.add(
      spl.createAssociatedTokenAccountIdempotentInstruction(owner, dst, vault, mint, program),
      spl.createTransferCheckedInstruction(src, mint, dst, owner, BigInt(d.amountRaw), d.decimals, [], program),
    );
  }
  tx.feePayer = owner;
  tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;
  const { signature } = await p.signAndSendTransaction(tx);
  await conn.confirmTransaction(signature, "confirmed");
  return signature;
}
