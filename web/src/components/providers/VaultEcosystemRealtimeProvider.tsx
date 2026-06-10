"use client";

import { useSession } from "next-auth/react";
import { useVaultEcosystemSubscription } from "@/hooks/useVaultEcosystemSubscription";
import { useRealtimeUserNotificationsSubscription } from "@/hooks/useRealtimeUserNotificationsSubscription";

/** Global realtime subscriptions for signed-in users (layaways, orders, listings, notifications). */
export function VaultEcosystemRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const userId = status === "authenticated" && session?.user?.id ? session.user.id : null;
  const enabled = status === "authenticated";

  useVaultEcosystemSubscription(userId, enabled);
  useRealtimeUserNotificationsSubscription(userId, enabled);

  return <>{children}</>;
}
