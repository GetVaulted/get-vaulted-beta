import type { Metadata } from "next";
import { JoinReferralLanding } from "@/components/auth/JoinReferralLanding";
import { DEFAULT_SITE_OG_IMAGE, SITE_NAME } from "@/lib/site-seo";
import { safeReturnTo } from "@/lib/safe-return-to";

const JOIN_TITLE = "Join Get Vaulted";
const JOIN_DESCRIPTION = "Download the Get Vaulted app and claim your referral invite.";

export const metadata: Metadata = {
  title: JOIN_TITLE,
  description: JOIN_DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    title: JOIN_TITLE,
    description: JOIN_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    images: [{ url: DEFAULT_SITE_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: JOIN_TITLE,
    description: JOIN_DESCRIPTION,
    images: [DEFAULT_SITE_OG_IMAGE],
  },
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
