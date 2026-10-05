"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SWEET16_POLL_MS, fetchSweet16Draft, type Sweet16Draft } from "@/lib/sweet16-draft-client";

/**
 * Polls the Sweet 16 draft for one lot while `enabled`. The server resolves any expired turn on
 * every read, so a poll is also what keeps a stalled draft moving. Stops polling once the draft
 * is complete (the final snapshot stays in `draft`).
 */
export function useSweet16Draft(args: { liveRoomId: string; itemId: string | null; enabled: boolean }) {
  const { liveRoomId, itemId, enabled } = args;
  const [draft, setDraft] = useState<Sweet16Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!itemId) return;
    const seq = ++seqRef.current;
    try {
      const next = await fetchSweet16Draft(liveRoomId, itemId);
      if (seq !== seqRef.current) return;
      setDraft(next);
      setError(null);
    } catch (e) {
      if (seq !== seqRef.current) return;
      setError(e instanceof Error ? e.message : "Could not load the draft.");
    }
  }, [liveRoomId, itemId]);

  // A different lot is a different draft: drop the old snapshot immediately.
  useEffect(() => {
    seqRef.current += 1;
    setDraft(null);
    setError(null);
  }, [itemId]);

  const complete = draft?.status === "complete";

  useEffect(() => {
    if (!enabled || !itemId || complete) return undefined;
    let cancelled = false;
    setLoading(true);
    void refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });
    const poll = setInterval(() => void refresh(), SWEET16_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [enabled, itemId, complete, refresh]);

  return { draft, setDraft, loading, error, refresh };
}
