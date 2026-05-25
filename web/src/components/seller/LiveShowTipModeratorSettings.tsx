"use client";

import { useCallback, useEffect, useState } from "react";

export type ModeratorSearchUser = {
  id: string;
  username: string;
  email: string;
};

type Props = {
  tipModeratorId: string | null;
  tipModeratorUsername: string;
  tipsToModerator: boolean;
  onModeratorChange: (id: string | null, username: string) => void;
  onTipsToModeratorChange: (value: boolean) => void;
  disabled?: boolean;
  idPrefix?: string;
};

export function LiveShowTipModeratorSettings({
  tipModeratorId,
  tipModeratorUsername,
  tipsToModerator,
  onModeratorChange,
  onTipsToModeratorChange,
  disabled = false,
  idPrefix = "tip-mod",
}: Props) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ModeratorSearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setMatches([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/seller/moderator-search?q=${encodeURIComponent(trimmed)}`);
      const j = (await res.json().catch(() => ({}))) as { users?: ModeratorSearchUser[] };
      setMatches(Array.isArray(j.users) ? j.users : []);
    } catch {
      setMatches([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void search(query), 280);
    return () => window.clearTimeout(t);
  }, [query, search]);

  const selectUser = (user: ModeratorSearchUser) => {
    onModeratorChange(user.id, user.username);
    setQuery("");
    setMatches([]);
  };

  const clearModerator = () => {
    onModeratorChange(null, "");
    onTipsToModeratorChange(false);
    setQuery("");
    setMatches([]);
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-search`} className="text-xs font-bold uppercase tracking-wide text-zinc-500">
          Show moderator (optional)
        </label>
        {tipModeratorId ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.1] bg-black/40 px-3 py-2.5">
            <span className="text-sm font-semibold text-zinc-100">@{tipModeratorUsername || "moderator"}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={clearModerator}
              className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400 transition hover:border-rose-500/35 hover:text-rose-200 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="relative mt-2">
            <input
              id={`${idPrefix}-search`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={disabled}
              placeholder="Search by username or email"
              className="w-full rounded-xl border border-white/[0.1] bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/15 disabled:opacity-50"
            />
            {searching ? (
              <p className="mt-1 text-xs text-zinc-500">Searching…</p>
            ) : matches.length > 0 ? (
              <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-white/10 bg-zinc-950 shadow-xl">
                {matches.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => selectUser(u)}
                      className="flex w-full flex-col items-start px-3 py-2.5 text-left text-sm transition hover:bg-white/[0.06] disabled:opacity-50"
                    >
                      <span className="font-semibold text-zinc-100">@{u.username}</span>
                      <span className="text-xs text-zinc-500">{u.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : query.trim().length >= 2 ? (
              <p className="mt-1 text-xs text-zinc-500">No users found.</p>
            ) : null}
          </div>
        )}
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
          Assign a co-host to help run chat and tools during your show.
        </p>
      </div>

      {tipModeratorId ? (
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-zinc-200">Send 100% of tips to moderator</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Get Vaulted does not take a platform fee from tips. Standard payment processing still applies.
            </p>
          </div>
          <input
            type="checkbox"
            checked={tipsToModerator}
            disabled={disabled}
            onChange={(e) => onTipsToModeratorChange(e.target.checked)}
            className="mt-1 size-5 shrink-0 rounded border-white/20 bg-zinc-900 accent-gold disabled:opacity-50"
          />
        </label>
      ) : null}
    </div>
  );
}

export async function patchLiveRoomTipSettings(
  liveRoomId: string,
  body: { tipModeratorId?: string | null; tipsToModerator?: boolean },
): Promise<{ ok: true; tip?: Record<string, unknown> } | { ok: false; error: string }> {
  const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string; tip?: Record<string, unknown> };
  if (!res.ok) {
    return { ok: false, error: typeof j.error === "string" ? j.error : "Could not save tip settings." };
  }
  return { ok: true, tip: j.tip };
}
