"use client";

import { useEffect, useState } from "react";

let cachedTopBuyerId: string | null | undefined;
let inflight: Promise<string | null> | null = null;

function loadTopBuyerId(): Promise<string | null> {
  return fetch("/api/live/top-buyer")
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { userId?: unknown } | null) => (typeof j?.userId === "string" ? j.userId : null))
    .catch(() => null);
}

/**
 * User id of the platform's top buyer (most paid orders, all-time), for the chat badge.
 * Fetched once per page load and shared by every chat row; the endpoint is edge-cached so this
 * stays cheap even with a very large audience.
 */
export function useTopBuyerId(): string | null {
  const [id, setId] = useState<string | null>(cachedTopBuyerId ?? null);
  useEffect(() => {
    if (cachedTopBuyerId !== undefined) {
      setId(cachedTopBuyerId);
      return;
    }
    let alive = true;
    inflight ??= loadTopBuyerId().then((v) => {
      cachedTopBuyerId = v;
      return v;
    });
    void inflight.then((v) => {
      if (alive) setId(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return id;
}
