import type { Metadata } from "next";
import { Suspense } from "react";
import { SupportPageShell } from "@/components/support/SupportPageShell";
import { SupportTicketDetailPage } from "@/components/support/SupportTicketDetailPage";
import { NOINDEX_METADATA } from "@/lib/site-seo";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Support ticket · Get Vaulted`,
    ...NOINDEX_METADATA,
  };
}

export default async function SupportTicketDetailRoutePage({ params }: Props) {
  const { id } = await params;
  return (
    <SupportPageShell backHref="/support/tickets" backLabel="← My tickets" title="Support ticket">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <SupportTicketDetailPage ticketId={id} />
      </Suspense>
    </SupportPageShell>
  );
}
