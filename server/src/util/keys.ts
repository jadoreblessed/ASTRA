import { randomBytes } from "node:crypto";

/** Prints fresh secrets for `.env`. Nothing is written anywhere. */
console.log(`MASTER_KEY=${randomBytes(32).toString("base64")}`);
console.log(`SIGNER_TOKEN=${randomBytes(32).toString("hex")}`);
