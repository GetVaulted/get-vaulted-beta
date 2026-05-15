import { AccountThreadPage } from "@/components/account/AccountThreadPage";

export default async function AccountMessageThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId: raw } = await params;
  const threadId = decodeURIComponent(raw);
  return <AccountThreadPage threadId={threadId} />;
}
