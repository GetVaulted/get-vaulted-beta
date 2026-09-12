"use client";

import { SessionProvider } from "next-auth/react";
import { PasswordRecoveryRedirect } from "@/components/auth/PasswordRecoveryRedirect";
import { AppPresenceHeartbeat } from "@/components/providers/AppPresenceHeartbeat";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PasswordRecoveryRedirect />
      <AppPresenceHeartbeat />
      {children}
    </SessionProvider>
  );
}
