"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const CONFIRM = "DELETE";

type Blocker = { code: string; message: string };

export function DeleteAccountPage() {
  const router = useRouter();
  const { status } = useSession();
  const [typed, setTyped] = useState("");
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBlockers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { credentials: "same-origin" });
      const data = (await res.json().catch(() => ({}))) as { blockers?: Blocker[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not load deletion requirements.");
        setBlockers([]);
        return;
      }
      setBlockers(Array.isArray(data.blockers) ? data.blockers : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/signin?returnTo=/account/delete");
      return;
    }
    if (status === "authenticated") void loadBlockers();
  }, [status, router, loadBlockers]);

  const canDelete = typed === CONFIRM && blockers.length === 0 && !busy;

  const submit = async () => {
    if (!canDelete) return;
    if (!window.confirm("Delete your account permanently? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE", credentials: "same-origin" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not delete account.");
        return;
      }
      await signOut({ redirect: false });
      router.replace("/?accountDeleted=1");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading" || status === "unauthenticated") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-zinc-500">
        {status === "loading" ? "Loading…" : null}
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <Link href="/account" className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
        ← My Account
      </Link>
      <h1 className="font-display mt-6 text-2xl font-bold text-foreground">Delete account</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        Deleting your account anonymizes your profile, revokes sign-in, and disconnects seller payout settings.
        Financial and compliance records may be retained where legally required. This action is irreversible.
      </p>

      {loading ? <p className="mt-6 text-sm text-zinc-500">Checking requirements…</p> : null}
      {error ? <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{error}</p> : null}

      {blockers.map((b) => (
        <p key={b.code} className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {b.message}
        </p>
      ))}

      <label className="mt-8 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Type {CONFIRM} to confirm</span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value.toUpperCase())}
          className="mt-2 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 py-2.5 text-sm text-foreground outline-none focus:border-gold/40"
          placeholder={CONFIRM}
          autoCapitalize="characters"
        />
      </label>

      <button
        type="button"
        disabled={!canDelete}
        onClick={() => void submit()}
        className="mt-6 w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Deleting…" : "Delete my account permanently"}
      </button>
    </main>
  );
}
