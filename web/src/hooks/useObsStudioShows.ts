"use client";

import { useCallback, useEffect, useState } from "react";

export type ObsStudioShowRow = {
  id: string;
  title: string;
  status: "scheduled" | "live" | "ended";
  roomType: string;
  scheduledStartAt: string | null;
  startedAt: string | null;
  viewerCount: number;
};

export function useObsStudioShows(sellerId: string | undefined) {
  const [rows, setRows] = useState<ObsStudioShowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [startBusyId, setStartBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/live-rooms?sellerId=${encodeURIComponent(sellerId)}&includeEnded=0&limit=40`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setError("Could not load your shows.");
        return;
      }
      const j = (await res.json()) as { rooms?: ObsStudioShowRow[] };
      const list = (Array.isArray(j.rooms) ? j.rooms : []).filter(
        (r) => r.status === "scheduled" || r.status === "live",
      );
      list.sort((a, b) => {
        if (a.status === b.status) {
          const ta = a.scheduledStartAt ?? a.startedAt ?? "";
          const tb = b.scheduledStartAt ?? b.startedAt ?? "";
          return ta.localeCompare(tb);
        }
        return a.status === "live" ? -1 : 1;
      });
      setRows(list);
      setSelectedId((prev) => (prev && list.some((r) => r.id === prev) ? prev : list[0]?.id ?? null));
    } catch {
      setError("Could not load your shows.");
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  const startShow = useCallback(
    async (roomId: string) => {
      setStartBusyId(roomId);
      setError(null);
      try {
        const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string; issues?: string[] };
        if (!res.ok) {
          setError(j.error ?? "Could not start show.");
          return false;
        }
        await load();
        setSelectedId(roomId);
        return true;
      } catch {
        setError("Could not start show.");
        return false;
      } finally {
        setStartBusyId(null);
      }
    },
    [load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return {
    rows,
    loading,
    error,
    selected,
    selectedId,
    setSelectedId,
    startBusyId,
    reload: load,
    startShow,
  };
}
