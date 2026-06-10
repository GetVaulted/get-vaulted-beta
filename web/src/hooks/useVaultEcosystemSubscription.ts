"use client";

import { useEffect } from "react";
import { dispatchVaultEcosystemWindowEvent } from "@/lib/dispatch-vault-ecosystem-window-event";
import { RT_EVENT, vaultEcosystemChannel } from "@/lib/realtime-channels";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser-client";
import type { VaultEcosystemEvent } from "@/lib/vault-ecosystem-realtime";

function parseVaultEcosystemPayload(raw: unknown): VaultEcosystemEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== "string" || typeof o.entityId !== "string" || typeof o.timestamp !== "string") return null;
  return o as VaultEcosystemEvent;
}

/** Subscribe to per-user vault ecosystem broadcast; refetch via window events. */
export function useVaultEcosystemSubscription(userId: string | null, enabled = true): void {
  useEffect(() => {
    if (!enabled || !userId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(vaultEcosystemChannel(userId))
      .on("broadcast", { event: RT_EVENT.vaultEcosystem }, ({ payload }) => {
        const event = parseVaultEcosystemPayload(payload);
        if (event) dispatchVaultEcosystemWindowEvent(event);
      });

    void channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, enabled]);
}
