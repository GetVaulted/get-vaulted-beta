import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSessionSafe } from "@/lib/auth";
import { SellerPullMediaManager } from "@/components/account/SellerPullMediaManager";

export default async function SellerPullsPage() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    redirect("/signin?returnTo=%2Faccount%2Fseller%2Fpulls");
  }

  return (
    <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-20 pt-8 sm:px-6">
      <Link
        href="/account/seller"
        className="inline-flex text-[11px] font-semibold uppercase tracking-wider text-gold-bright/90 transition hover:text-gold-bright"
      >
        ← Seller hub
      </Link>
      <h1 className="font-display mt-4 text-2xl font-black tracking-tight text-foreground">Pulls</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Show off photos and short clips of your best pulls on your public profile. Up to 20 photos and 5
        videos (20 seconds or shorter each).
      </p>
      <div className="mt-6">
        <SellerPullMediaManager />
      </div>
    </main>
  );
}
