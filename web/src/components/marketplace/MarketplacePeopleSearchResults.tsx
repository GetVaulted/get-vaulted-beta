"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SellerFollowButton } from "@/components/seller/SellerFollowButton";

export type PeopleSearchHit = {
  id: string;
  username: string;
  image: string | null;
  following: boolean;
  followerCount: number;
};

type Props = {
  query: string;
};

/**
 * People directory for marketplace search — find users by username to open profile / follow.
 */
export function MarketplacePeopleSearchResults({ query }: Props) {
  const q = query.trim().replace(/^@+/, "");
  const [users, setUsers] = useState<PeopleSearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.length < 1) {
      setUsers([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      void fetch(`/api/users/people-search?q=${encodeURIComponent(q)}`, { credentials: "include" })
        .then(async (res) => {
          if (!res.ok) return [] as PeopleSearchHit[];
          const j = (await res.json()) as { users?: PeopleSearchHit[] };
          return Array.isArray(j.users) ? j.users : [];
        })
        .then((rows) => {
          if (!cancelled) setUsers(rows);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [q]);

  if (q.length < 1) return null;

  return (
    <section className="mt-5 sm:mt-6" aria-labelledby="people-search-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">People</p>
          <h2 id="people-search-title" className="font-display text-lg font-bold text-foreground">
            Find users to follow
          </h2>
        </div>
        {loading ? <p className="text-xs text-zinc-500">Searching…</p> : null}
      </div>

      {!loading && users.length === 0 ? (
        <p className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3 text-sm text-zinc-500">
          No users match “{q}”. Try their exact username.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
              <Link
                href={`/seller/${encodeURIComponent(u.username)}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <span className="relative size-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-zinc-900">
                  {u.image ? (
                    <Image src={u.image} alt="" fill className="object-cover" sizes="40px" unoptimized />
                  ) : (
                    <span className="flex size-full items-center justify-center text-xs font-bold text-zinc-500">
                      {(u.username[0] ?? "?").toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-zinc-100">@{u.username}</span>
                  <span className="block text-[11px] text-zinc-500">
                    {u.followerCount.toLocaleString("en-US")} follower
                    {u.followerCount === 1 ? "" : "s"}
                  </span>
                </span>
              </Link>
              <SellerFollowButton sellerUserId={u.id} variant="inline" showFollowerCount={false} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
