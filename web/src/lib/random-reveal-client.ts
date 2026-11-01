import { parseVaultRevealSpinPayload, type VaultRevealSpinPayload } from "@/lib/vault-reveal-spin";

/**
 * Fetch the reveal for the signed-in buyer's own random-reveal purchase. Retries briefly: the label
 * is assigned when payment settles, which can land a moment after the purchase response.
 */
export async function fetchOwnRandomReveal(
  liveRoomId: string,
  purchaseId: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<VaultRevealSpinPayload | null> {
  const attempts = opts.attempts ?? 6;
  const delayMs = opts.delayMs ?? 500;
  const url = `/api/live-rooms/${encodeURIComponent(liveRoomId)}/reveals/${encodeURIComponent(purchaseId)}`;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (res.ok) {
        const spin = parseVaultRevealSpinPayload(await res.json());
        if (spin) return spin;
      } else if (res.status !== 404) {
        return null;
      }
    } catch {
      /* network blip — retry */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}
