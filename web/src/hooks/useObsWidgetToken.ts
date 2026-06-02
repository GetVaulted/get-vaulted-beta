"use client";

import { useCallback, useEffect, useState } from "react";

export function useObsWidgetToken(roomId: string | null) {
  const [hasToken, setHasToken] = useState(false);
  const [rotatedAt, setRotatedAt] = useState<string | null>(null);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!roomId) {
      setHasToken(false);
      setRotatedAt(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/obs-widget-token`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        hasToken?: boolean;
        rotatedAt?: string | null;
      };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Could not load widget token status.");
        return;
      }
      setHasToken(j.hasToken === true);
      setRotatedAt(j.rotatedAt ?? null);
    } catch {
      setError("Could not load widget token status.");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  const rotateToken = useCallback(async () => {
    if (!roomId) return null;
    setRotating(true);
    setError(null);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/obs-widget-token`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
        rotatedAt?: string;
      };
      if (!res.ok || typeof j.token !== "string") {
        setError(typeof j.error === "string" ? j.error : "Could not rotate widget token.");
        return null;
      }
      setPlainToken(j.token);
      setHasToken(true);
      setRotatedAt(j.rotatedAt ?? new Date().toISOString());
      return j.token;
    } catch {
      setError("Could not rotate widget token.");
      return null;
    } finally {
      setRotating(false);
    }
  }, [roomId]);

  useEffect(() => {
    setPlainToken(null);
    void loadStatus();
  }, [loadStatus]);

  return {
    hasToken,
    rotatedAt,
    plainToken,
    loading,
    rotating,
    error,
    loadStatus,
    rotateToken,
    setPlainToken,
  };
}
