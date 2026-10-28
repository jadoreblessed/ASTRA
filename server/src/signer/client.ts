import { config } from "../config.js";

/** The API's and worker's only way to ask for a signature. */
export async function signer<T = unknown>(path: string, body: unknown): Promise<{ ok: true; result: T } | { ok: false; code: string; error: string }> {
  try {
    const res = await fetch(`http://${config.SIGNER_HOST}:${config.SIGNER_PORT}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signer-token": config.SIGNER_TOKEN },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    return (await res.json()) as { ok: true; result: T } | { ok: false; code: string; error: string };
  } catch (err) {
    return { ok: false, code: "signer_unreachable", error: (err as Error).message };
  }
}

export async function signerUp(): Promise<boolean> {
  try {
    const res = await fetch(`http://${config.SIGNER_HOST}:${config.SIGNER_PORT}/health`, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}
