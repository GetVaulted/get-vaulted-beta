import Link from "next/link";
import { redirect } from "next/navigation";
import { SellerFollowButton } from "@/components/seller/SellerFollowButton";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sellerProfilePath } from "@/lib/seller-profile-url";

export default async function AccountFollowingPage() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    redirect("/signin?returnTo=/account/following");
  }

  const userId = session.user.id;

  const [following, followers] = await Promise.all([
    prisma.sellerFollow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        seller: {
          select: {
            id: true,
            username: true,
            image: true,
          },
        },
      },
    }),
    prisma.sellerFollow.findMany({
      where: { sellerId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            image: true,
          },
        },
      },
    }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-20 pt-8 sm:px-6 lg:px-10">
      <header className="mb-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Account</p>
        <h1 className="mt-2 font-display text-2xl font-black tracking-tight text-zinc-100 sm:text-3xl">Followers & Following</h1>
        <p className="mt-2 text-sm text-zinc-400">Track seller relationships and unfollow anytime.</p>
      </header>

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Following</h2>
          <span className="text-xs tabular-nums text-zinc-500">{following.length}</span>
        </div>
        {following.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/[0.08] bg-black/20 px-4 py-6 text-sm text-zinc-500">
            You are not following any sellers yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {following.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5">
                <Link href={sellerProfilePath(row.seller.username)} className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">@{row.seller.username}</p>
                  <p className="text-[11px] text-zinc-500">Following since {new Date(row.createdAt).toLocaleDateString()}</p>
                </Link>
                <SellerFollowButton sellerUserId={row.seller.id} variant="inline" showFollowerCount={false} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Followers</h2>
          <span className="text-xs tabular-nums text-zinc-500">{followers.length}</span>
        </div>
        {followers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/[0.08] bg-black/20 px-4 py-6 text-sm text-zinc-500">
            No followers yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {followers.map((row) => (
              <li key={row.id} className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5">
                <Link href={sellerProfilePath(row.follower.username)} className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">@{row.follower.username}</p>
                  <p className="text-[11px] text-zinc-500">Started following on {new Date(row.createdAt).toLocaleDateString()}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
