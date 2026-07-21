import type { Metadata } from "next";
import { JoinReferralLanding } from "@/components/auth/JoinReferralLanding";
import { safeReturnTo } from "@/lib/safe-return-to";

export const metadata: Metadata = {
  title: "Join Get Vaulted",
  description: "Download the Get Vaulted app and claim your referral invite.",
  robots: { index: false, follow: false },
};

export default async function JoinPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string; ref?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const returnTo = safeReturnTo(typeof sp.returnTo === "string" ? sp.returnTo : null);
  const referralCode = typeof sp.ref === "string" ? sp.ref.trim().slice(0, 32) : "";

  return <JoinReferralLanding referralCode={referralCode} returnTo={returnTo} />;
}
