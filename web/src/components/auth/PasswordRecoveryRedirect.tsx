"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Mobile password reset used to omit redirectTo, so Supabase sent users to Site URL
 * (homescreen) with `#...&type=recovery`. Catch that and send them to /reset-password.
 */
export function PasswordRecoveryRedirect() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/reset-password")) return;
    if (pathname.startsWith("/auth/callback") || pathname.startsWith("/mobile/auth/callback")) return;

    const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    if (!hash) return;

    const params = new URLSearchParams(hash);
    if (params.get("type") !== "recovery") return;

    const search = window.location.search || "";
    router.replace(`/reset-password${search}${window.location.hash}`);
  }, [pathname, router]);

  return null;
}
