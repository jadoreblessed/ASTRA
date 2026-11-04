import { closeDb } from "../db.js";
import { sealedVaultForEnv, vaultAddress } from "../chain/wallet.js";
import { migrate } from "./migrate.js";

/**
 * Prints the sealed vault as a VAULT_SEALED= line for the env file. The vault's
 * key otherwise lives only in the database, and an env copy means losing the
 * database can't lose the vault. It is sealed: useless without MASTER_KEY.
 */
await migrate();
console.log(`VAULT_ADDRESS=${await vaultAddress()}`);
console.log(`VAULT_SEALED=${await sealedVaultForEnv()}`);
await closeDb();
