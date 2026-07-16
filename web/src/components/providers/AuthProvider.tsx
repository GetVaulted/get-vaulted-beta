"use client";

import { SessionProvider } from "next-auth/react";
import { PasswordRecoveryRedirect } from "@/components/auth/PasswordRecoveryRedirect";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PasswordRecoveryRedirect />
      {children}
    </SessionProvider>
  );
}
