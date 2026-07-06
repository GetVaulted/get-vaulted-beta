import { redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/safe-return-to";

export default async function JoinPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string; ref?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const normalized = safeReturnTo(typeof sp.returnTo === "string" ? sp.returnTo : null);
  const params = new URLSearchParams();
  if (normalized !== "/marketplace") params.set("returnTo", normalized);
  // Referral link (`/join?ref=<username>`) — forwarded so `SignupForm` can attribute the new
  // account to the referrer. Mobile handles the same `/join?ref=...` URL as a universal link
  // straight into `AuthSignUp` (see `linkingConfig.ts`) without ever hitting this redirect.
  if (typeof sp.ref === "string" && sp.ref.trim()) params.set("ref", sp.ref.trim().slice(0, 20));
  const qs = params.toString();
  redirect(`/signup${qs ? `?${qs}` : ""}`);
}
