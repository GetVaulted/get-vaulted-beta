import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountBlockedUsersClient } from "@/components/account/AccountBlockedUsersClient";
import { getServerSessionSafe } from "@/lib/auth";
import { listBlockedUsersForAccount } from "@/lib/user-block";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AccountBlockedUsersPage() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    redirect("/signin?returnTo=/account/blocked");
  }

  const blocked = await listBlockedUsersForAccount(prisma, session.user.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-20 pt-8 sm:px-6 lg:px-10">
      <header className="mb-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Account</p>
        <h1 className="mt-2 font-display text-2xl font-black tracking-tight text-zinc-100 sm:text-3xl">
          Blocked users
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Blocked people can&apos;t find you or see your listings, shows, or profile — and you won&apos;t see
          theirs. Admins cannot be blocked.
        </p>
        <Link href="/account" className="mt-3 inline-block text-xs font-medium text-gold-bright hover:underline">
          ← Back to account
        </Link>
      </header>

      <AccountBlockedUsersClient initialBlocked={blocked} />
    </main>
  );
}
