import { redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/safe-return-to";

export default async function JoinPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const normalized = safeReturnTo(typeof sp.returnTo === "string" ? sp.returnTo : null);
  const rt = normalized !== "/marketplace" ? `?returnTo=${encodeURIComponent(normalized)}` : "";
  redirect(`/signup${rt}`);
}
