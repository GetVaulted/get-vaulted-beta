import type { Metadata } from "next";
import { SupportPageShell } from "@/components/support/SupportPageShell";
import { SupportTicketsPage } from "@/components/support/SupportTicketsPage";
import { CANONICAL_SHARE_SITE_FALLBACK } from "@/lib/live-room-share-metadata";

export const metadata: Metadata = {
  title: "My Support Tickets · Get Vaulted",
  description: "View support tickets you submitted to Get Vaulted.",
  alternates: {
    canonical: `${CANONICAL_SHARE_SITE_FALLBACK}/support/tickets`,
  },
};

export default function SupportTicketsRoutePage() {
  return (
    <SupportPageShell title="My Support Tickets" subtitle="Track open and resolved requests.">
      <SupportTicketsPage />
    </SupportPageShell>
  );
}
