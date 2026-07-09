import type { Metadata } from "next";
import { SupportPageShell } from "@/components/support/SupportPageShell";
import { SupportTicketsPage } from "@/components/support/SupportTicketsPage";
import { NOINDEX_METADATA } from "@/lib/site-seo";

export const metadata: Metadata = {
  title: "My Support Tickets · Get Vaulted",
  description: "View support tickets you submitted to Get Vaulted.",
  ...NOINDEX_METADATA,
};

export default function SupportTicketsRoutePage() {
  return (
    <SupportPageShell title="My Support Tickets" subtitle="Track open and resolved requests.">
      <SupportTicketsPage />
    </SupportPageShell>
  );
}
