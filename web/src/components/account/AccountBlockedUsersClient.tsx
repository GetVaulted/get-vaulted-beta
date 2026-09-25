"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sellerProfilePath } from "@/lib/seller-profile-url";

export type BlockedUserRow = {
  userId: string;
  username: string | null;
  image: string | null;
  blockedAt: string;
};

export function AccountBlockedUsersClient({ initialBlocked }: { initialBlocked: BlockedUserRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialBlocked);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unblock = async (userId: string) => {
    setError(null);
    setBusyId(userId);
    try {
      const res = await fetch(`/api/account/blocks/${encodeURIComponent(userId)}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Could not unblock.");
      }
      setRows((prev) => prev.filter((r) => r.userId !== userId));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unblock.");
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/[0.08] bg-black/20 px-4 py-8 text-center text-sm text-zinc-500">
        You haven&apos;t blocked anyone.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.userId}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5"
          >
            <div className="min-w-0">
              {row.username ? (
                <Link
                  href={sellerProfilePath(row.username)}
                  className="truncate text-sm font-semibold text-zinc-100 hover:text-gold-bright"
                >
                  @{row.username}
                </Link>
              ) : (
                <p className="truncate text-sm font-semibold text-zinc-100">User</p>
              )}
              <p className="text-[11px] text-zinc-500">
                Blocked {new Date(row.blockedAt).toLocaleDateString()}
              </p>
            </div>
            <button
              type="button"
              disabled={busyId === row.userId}
              onClick={() => void unblock(row.userId)}
              className="shrink-0 rounded-full border border-white/[0.12] px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-white/25 hover:text-zinc-100 disabled:opacity-60"
            >
              {busyId === row.userId ? "…" : "Unblock"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
