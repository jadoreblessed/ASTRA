import { Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createInitializeMint2Instruction, createMintToInstruction, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, getMinimumBalanceForRentExemptMint, MINT_SIZE, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { CATALOG, SOL_MINT, USDC_MINT } from "../catalog.js";
import { config } from "../config.js";
import { quote, resolveSymbol, swapTransaction } from "../chain/jupiter.js";
import { rpc, parsedTx, received } from "../chain/rpc.js";
import { accountsExist, ataRent, burnShares, burnTokens, createShareMint, mintDecimals, mintShares, payIn, signatureState, tokenBalance, transfer } from "../chain/spl.js";

/**
 * Checks the real chain code without spending real money.
 *
 *   npm run check:devnet   every SPL write, for real, on a local validator or devnet
 *   npm run check:swaps    real Jupiter swaps through mainnet's simulator, as a
 *                          big public wallet: nothing is signed or sent
 */

const line = (ok: boolean, what: string, detail = "") => {
  console.log(`${ok ? "  ok " : "FAIL "} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
};
const sol = (l: number | bigint) => `${(Number(l) / 1e9).toFixed(6)} SOL`;

async function devnet(): Promise<void> {
  if (config.SOLANA_RPC_URL.includes("mainnet")) throw new Error("Point SOLANA_RPC_URL at a local validator or devnet, never mainnet.");
  const c = rpc();
  const vault = Keypair.generate();
  const user = Keypair.generate();
  console.log("funding from the devnet faucet…");
  for (const k of [vault, user]) {
    const sig = await c.requestAirdrop(k.publicKey, 500_000_000);
    await c.confirmTransaction(sig, "confirmed");
  }
  line(true, "faucet", `${sol(await c.getBalance(vault.publicKey))} each`);

  // The share token: classic SPL, vault as mint authority.
  const shareKey = Keypair.generate();
  const created = await createShareMint(vault, shareKey, 6);
  const share = shareKey.publicKey.toBase58();
  line(created.costLamports > 500_000 && created.costLamports < 1_600_000, "open a share mint", `cost ${sol(created.costLamports)}`);
  line((await mintDecimals(share)) === 6, "mint reads back", "6 decimals");

  let signed = "";
  const minted = await mintShares(vault, share, user.publicKey.toBase58(), 5_000_000n, (s) => {
    signed = s;
  });
  line(signed === minted.sig, "the signature is known before sending");
  line((await signatureState(minted.sig)) === "confirmed", "signature state reads confirmed");
  line(minted.costLamports > 1_000_000 && minted.costLamports < 2_100_000, "mint shares to a new buyer", `cost ${sol(minted.costLamports)} (their account's rent + fee)`);
  line((await tokenBalance(user.publicKey.toBase58(), share)) === 5_000_000n, "buyer holds the shares");
  const again = await mintShares(vault, share, user.publicKey.toBase58(), 1_000_000n);
  line(again.costLamports < 50_000, "mint again, account already open", `cost ${sol(again.costLamports)}`);

  // Selling: the shares go back to the vault with the network fee, in one transaction.
  const network = 300_000n;
  const vaultAddr = vault.publicKey.toBase58();
  const paid = await payIn(user, share, vaultAddr, 2_000_000n, 6, network);
  const tx = await parsedTx(paid.sig);
  line(Boolean(tx) && received(tx!, vaultAddr, share) === 2_000_000n, "deposit: shares arrive");
  line(Boolean(tx) && received(tx!, vaultAddr, "SOL") === network, "deposit: network fee arrives in the same transaction", sol(network));
  const burned = await burnShares(vault, share, 2_000_000n);
  line((await tokenBalance(vaultAddr, share)) === 0n, "burn the shares", `cost ${sol(burned.costLamports)}`);

  // Paying SOL in, and SOL out.
  const solIn = await payIn(user, "SOL", vaultAddr, 10_000_000n, 9, 300_000n);
  const solTx = await parsedTx(solIn.sig);
  line(Boolean(solTx) && received(solTx!, vaultAddr, "SOL") === 10_300_000n, "deposit in SOL: amount + fee");
  const solOut = await transfer(vault, vault, "SOL", user.publicKey.toBase58(), 1_000_000n, 9);
  line(solOut.costLamports < 50_000, "payout in SOL counts only the fee as cost", `cost ${sol(solOut.costLamports)}, not the 0.001 SOL that moved`);

  // A Token-2022 mint, like the xStocks: account rent, transfer to a new owner, burn.
  const t22 = Keypair.generate();
  const rent = await c.getMinimumBalanceForRentExemption(MINT_SIZE);
  await sendAndConfirmTransaction(
    c,
    new Transaction().add(
      SystemProgram.createAccount({ fromPubkey: vault.publicKey, newAccountPubkey: t22.publicKey, space: MINT_SIZE, lamports: rent, programId: TOKEN_2022_PROGRAM_ID }),
      createInitializeMint2Instruction(t22.publicKey, 8, vault.publicKey, null, TOKEN_2022_PROGRAM_ID),
    ),
    [vault, t22],
  );
  const t22Mint = t22.publicKey.toBase58();
  const vaultAta = getAssociatedTokenAddressSync(t22.publicKey, vault.publicKey, false, TOKEN_2022_PROGRAM_ID);
  await sendAndConfirmTransaction(
    c,
    new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(vault.publicKey, vaultAta, vault.publicKey, t22.publicKey, TOKEN_2022_PROGRAM_ID),
      createMintToInstruction(t22.publicKey, vaultAta, vault.publicKey, 900_000_000n, [], TOKEN_2022_PROGRAM_ID),
    ),
    [vault],
  );
  const [openBefore] = await accountsExist([{ mint: t22Mint, owner: user.publicKey.toBase58() }]);
  line(!openBefore, "sees the buyer has no account for it yet");
  const estimate = await ataRent(t22Mint);
  const out = await transfer(vault, vault, t22Mint, user.publicKey.toBase58(), 100_000_000n, 8);
  const actualRent = out.costLamports - 15_000;
  line(Math.abs(estimate - actualRent) < 60_000, "Token-2022 payout to a new owner: rent estimate matches", `estimated ${sol(estimate)}, cost ${sol(out.costLamports)}`);
  line((await tokenBalance(user.publicKey.toBase58(), t22Mint)) === 100_000_000n, "buyer holds the Token-2022 token");
  const [openAfter] = await accountsExist([{ mint: t22Mint, owner: user.publicKey.toBase58() }]);
  line(openAfter, "sees the account now exists");
  await burnTokens(vault, t22Mint, 800_000_000n);
  line((await tokenBalance(vaultAddr, t22Mint)) === 0n, "burn a Token-2022 token (the buyback's burn)");

  // A transaction that fails on chain is reported as failed, not as sent.
  await transfer(vault, vault, share, user.publicKey.toBase58(), 999_999_999n, 6).then(
    () => line(false, "an impossible transfer should fail"),
    () => line(true, "an impossible transfer is refused"),
  );
  console.log(`vault spent, all in: ${sol(500_000_000 - (await c.getBalance(vault.publicKey)))}`);
}

/** Big public wallets that hold USDC and SOL: their balances make the simulator run the swap all the way. */
const WHALES = [
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm",
  "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS",
  "5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD",
  "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2",
  "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
];

async function swaps(): Promise<void> {
  const c = rpc();
  const whale = await (async () => {
    for (const w of WHALES) {
      const usdc = await c.getParsedTokenAccountsByOwner(new PublicKey(w), { mint: new PublicKey(USDC_MINT) }).catch(() => null);
      const a = usdc?.value[0]?.account.data.parsed.info as { state: string; tokenAmount: { uiAmount: number } } | undefined;
      if (a?.state === "initialized" && a.tokenAmount.uiAmount > 10 && (await c.getBalance(new PublicKey(w))) > 1e8) return w;
    }
    throw new Error("no public wallet with balances found");
  })();
  console.log(`simulating as ${whale} — nothing is signed or sent`);

  const pick = async (symbol: string) => {
    const known = CATALOG.find((a) => a.symbol === symbol)?.mint;
    return known ?? (await resolveSymbol(symbol))?.id ?? null;
  };
  const pairs: [string, string, bigint, string][] = [
    ["USDC", "NVDAx", 1_000_000n, "stock (Token-2022)"],
    ["USDC", "SPYx", 800_000n, "stock (Token-2022)"],
    ["USDC", "wBTC", 200_000n, "crypto"],
    ["USDC", "BONK", 300_000n, "meme"],
    ["USDC", "SOL", 500_000n, "into native SOL"],
    ["SOL", "NVDAx", 5_000_000n, "paying with SOL"],
  ];
  for (const [from, to, raw, note] of pairs) {
    const inMint = from === "USDC" ? USDC_MINT : SOL_MINT;
    const outMint = to === "SOL" ? SOL_MINT : await pick(to);
    if (!outMint) {
      line(false, `${from} → ${to}`, "mint not found");
      continue;
    }
    try {
      const q = await quote(inMint, outMint, raw, config.MAX_SLIPPAGE_BPS);
      const swap = await swapTransaction(q, whale);
      const tx = VersionedTransaction.deserialize(Buffer.from(swap.tx, "base64"));
      const sim = await c.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
      const fee = (await c.getFeeForMessage(tx.message, "confirmed")).value;
      if (sim.value.err) {
        const logs = (sim.value.logs ?? []).filter((l) => /error|failed|insufficient/i.test(l)).slice(0, 2).join(" | ");
        line(false, `${from} → ${to} (${note})`, `${JSON.stringify(sim.value.err)} ${logs}`);
      } else {
        line(true, `${from} → ${to} (${note})`, `out ${q.outAmount}, ${sim.value.unitsConsumed} CU, fee ${fee} lamports`);
      }
    } catch (err) {
      line(false, `${from} → ${to} (${note})`, (err as Error).message);
    }
  }

  // What opening the vault's account costs, per token, against what buyers get charged.
  const rents: string[] = [];
  for (const symbol of ["NVDAx", "SPYx", "AAPLx", "BONK", "WIF"]) {
    const mint = await pick(symbol);
    if (mint) rents.push(`${symbol} ${sol(await ataRent(mint))}`);
  }
  console.log(`account rent: ${rents.join(", ")}`);
}

const mode = process.argv[2];
await (mode === "devnet" ? devnet() : swaps());
console.log(process.exitCode ? "\nSOMETHING FAILED" : "\nall good");
process.exit();
