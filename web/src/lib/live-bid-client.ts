/** Client-side idempotency for `POST /api/live-rooms/.../bid` (matches server `LiveBidIdempotency`). */
export function createLiveBidIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `bid-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function liveBidRequestHeaders(idempotencyKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  };
}

export const liveCommerceFetchInit: RequestInit = {
  credentials: "include",
};
