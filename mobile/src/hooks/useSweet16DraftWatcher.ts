import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchSweet16Draft,
  type Sweet16DraftSnapshot,
} from '../api/liveSweet16DraftRepository';
import { sweet16MyTurnKey } from '../lib/liveSweet16Draft';

/** Light poll while a draft can exist; realtime events (via `refreshSignal`) make it near-instant. */
const WATCH_POLL_MS = 4000;

/**
 * Keeps a current Sweet 16 draft snapshot for the active item so the app can react to the draft
 * (auto-open the sheet on the viewer's turn) even while the sheet is closed.
 *
 * - Refetches whenever `refreshSignal` changes (parent bumps it on `sweet16_draft_*` realtime events).
 * - Polls every few seconds while `enabled` and the draft is not complete (404 before the host
 *   randomizes is a normal `null`). Polling is paused while `paused` (the open sheet polls itself and
 *   feeds results back through `applyDraft`).
 * - Stale responses never overwrite newer ones.
 */
export function useSweet16DraftWatcher(args: {
  enabled: boolean;
  roomId: string;
  itemId: string | null;
  accessToken?: string;
  refreshSignal?: number;
  paused?: boolean;
}): {
  draft: Sweet16DraftSnapshot | null;
  /** Non-null exactly while it is the viewer's turn; changes for every turn they own. */
  myTurnKey: string | null;
  refresh: () => Promise<void>;
  applyDraft: (draft: Sweet16DraftSnapshot | null) => void;
} {
  const { enabled, roomId, itemId, accessToken, refreshSignal = 0, paused = false } = args;
  const [draft, setDraft] = useState<Sweet16DraftSnapshot | null>(null);
  const seqRef = useRef(0);
  const appliedRef = useRef(0);
  const itemRef = useRef<string | null>(itemId);
  itemRef.current = itemId;

  // A different lot has its own draft — never carry a snapshot across items.
  useEffect(() => {
    seqRef.current += 1;
    appliedRef.current = seqRef.current;
    setDraft(null);
  }, [itemId, roomId]);

  const refresh = useCallback(async () => {
    if (!enabled || !itemId || !accessToken?.trim()) return;
    const seq = ++seqRef.current;
    try {
      const next = await fetchSweet16Draft(accessToken, roomId, itemId);
      if (seq < appliedRef.current || itemRef.current !== itemId) return;
      appliedRef.current = seq;
      setDraft(next);
    } catch {
      /* keep the last snapshot; the next poll/event retries */
    }
  }, [enabled, itemId, accessToken, roomId]);

  const applyDraft = useCallback((next: Sweet16DraftSnapshot | null) => {
    appliedRef.current = ++seqRef.current;
    setDraft(next);
  }, []);

  const lastSignalRef = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal === lastSignalRef.current) return;
    lastSignalRef.current = refreshSignal;
    void refresh();
  }, [refreshSignal, refresh]);

  const complete = draft?.status === 'complete';
  useEffect(() => {
    if (!enabled || !itemId || complete) return undefined;
    void refresh();
    if (paused) return undefined;
    const id = setInterval(() => void refresh(), WATCH_POLL_MS);
    return () => clearInterval(id);
  }, [enabled, itemId, complete, paused, refresh]);

  const myTurnKey = useMemo(() => sweet16MyTurnKey(draft), [draft]);
  return { draft, myTurnKey, refresh, applyDraft };
}
