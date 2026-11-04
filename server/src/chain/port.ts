import { PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { quote, swapTransaction } from "./jupiter.js";
import { COMMITMENT, parsedTx, received, rpc } from "./rpc.js";
import {
  accountsExist,
  ataRent,
  burnShares,
  classicRent,
  burnTokens,
  createShareMint,
  mintDecimals,
  mintRent,
  mintShares,
  payIn,
  rentFloor,
  sendVersioned,
  signatureState,
  tokenBalance,
  transfer,
} from "./spl.js";

/**
 * Every way the money code reaches the chain, in one object. The signer and the
 * order routes call through it so the order flows can be tested end to end
 * against a fake chain (`tests/flows.test.ts`), with no SOL and no network.
 */
export const chain = {
  quote,
  swapTransaction,
  sendVersioned,
  createShareMint,
  mintShares,
  burnShares,
  burnTokens,
  transfer,
  payIn,
  tokenBalance,
  mintRent,
  mintDecimals,
  signatureState,
  accountsExist,
  ataRent,
  classicRent,
  rentFloor,
  balanceOf: (address: string): Promise<number> => rpc().getBalance(new PublicKey(address), COMMITMENT),
  /** What `owner` received in a transaction; null while it isn't visible yet. */
  receivedIn: async (sig: string, owner: string, mint: string | "SOL"): Promise<bigint | null> => {
    const tx = await parsedTx(sig).catch(() => null);
    return tx ? received(tx, owner, mint) : null;
  },
  readTx: (sig: string): Promise<ParsedTransactionWithMeta | null> => parsedTx(sig),
};
