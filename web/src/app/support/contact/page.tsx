import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactSupportPage } from "@/components/support/ContactSupportPage";
import { SupportPageShell } from "@/components/support/SupportPageShell";
import { CANONICAL_SHARE_SITE_FALLBACK } from "@/lib/live-room-share-metadata";

export const metadata: Metadata = {
  title: "Contact Support · Get Vaulted",
  description: "Submit a support ticket to the Get Vaulted team.",
  alternates: {
    canonical: `${CANONICAL_SHARE_SITE_FALLBACK}/support/contact`,
  },
};

export default function SupportContactRoutePage() {
  return (
    <SupportPageShell title="Contact Support" subtitle="We respond in order received — usually within 1–2 business days.">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <ContactSupportPage />
      </Suspense>
    </SupportPageShell>
  );
}
