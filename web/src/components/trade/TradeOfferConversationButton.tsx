"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Opens (or resumes) the participant-scoped trade chat for this offer. */
export function TradeOfferConversationButton({
  offerId,
  conversationId,
}: {
  offerId: string;
  conversationId?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openChat = async () => {
    setError(null);
    if (conversationId?.trim()) {
      router.push(`/account/messages/${encodeURIComponent(conversationId.trim())}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/trade/offers/${encodeURIComponent(offerId)}/conversation`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        threadId?: string;
        href?: string;
      };
      if (!res.ok || !body.threadId) {
        setError(body.error ?? "Could not open trade chat.");
        return;
      }
      router.push(body.href ?? `/account/messages/${encodeURIComponent(body.threadId)}`);
    } catch {
      setError("Could not open trade chat.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void openChat()}
        className="inline-flex h-11 items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-5 text-sm font-semibold text-gold-bright transition hover:bg-gold/15 disabled:opacity-60"
      >
        {busy ? "Opening…" : conversationId ? "Open trade chat" : "Message about this trade"}
      </button>
      {error ? <p className="text-xs font-medium text-rose-300">{error}</p> : null}
    </div>
  );
}
