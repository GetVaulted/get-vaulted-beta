"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const CONFIRM = "DELETE";

type Blocker = { code: string; message: string };

const DELETION_REQUIREMENTS = [
  "No open purchases waiting on delivery or resolution.",
  "No open sales you still need to fulfill.",
  "No active live show you are hosting.",
  "No seller reports under moderation review.",
  "Pending Stripe seller payouts withdrawn or resolved.",
] as const;

function PublicAccountDeletionInfo() {
  return (
    <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-300">
      <section className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">What happens when you delete</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
          <li>Your profile is anonymized and you are signed out everywhere.</li>
          <li>Seller payout settings and saved payment methods are disconnected.</li>
          <li>Active listings are ended; draft listings are removed from sale.</li>
          <li>Financial, tax, and compliance records may be retained where legally required.</li>
          <li>Deletion is permanent and cannot be undone.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-foreground">Before you delete</h2>
        <p className="mt-3 text-muted">Account deletion may be blocked until you resolve:</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
          {DELETION_REQUIREMENTS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-foreground">Delete from the app</h2>
        <p className="mt-3 text-muted">
          In the Get Vaulted mobile app, go to <strong className="text-zinc-200">Settings → Account → Delete account</strong>,
          type <strong className="text-zinc-200">{CONFIRM}</strong>, and confirm.
        </p>
      </section>

      <section className="rounded-2xl border border-gold/20 bg-gold/5 p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Delete on the web</h2>
        <p className="mt-3 text-muted">
          Sign in to your Get Vaulted account, then complete deletion on this page. You will need to type{" "}
          <strong className="text-zinc-200">{CONFIRM}</strong> to confirm.
        </p>
        <Link
          href="/signin?returnTo=/account/delete"
          className="mt-5 inline-flex rounded-xl bg-gold px-5 py-3 text-sm font-bold text-black transition hover:bg-gold-bright"
        >
          Sign in to delete account
        </Link>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-foreground">Need help?</h2>
        <p className="mt-3 text-muted">
          Email{" "}
          <a href="mailto:support@shopgetvaulted.com" className="font-semibold text-gold-bright hover:underline">
            support@shopgetvaulted.com
          </a>{" "}
          with subject line <strong className="text-zinc-200">Account deletion</strong> if you cannot sign in or need
          assistance.
        </p>
      </section>
    </div>
  );
}

export function DeleteAccountPage() {
  const router = useRouter();
  const { status } = useSession();
  const [typed, setTyped] = useState("");
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [loading, setLoading] = useState(false);
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
    if (status === "authenticated") void loadBlockers();
  }, [status, loadBlockers]);

  const canDelete = typed === CONFIRM && blockers.length === 0 && !busy && status === "authenticated";

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
        await loadBlockers();
        return;
      }
      await signOut({ redirect: false });
      router.replace("/?accountDeleted=1");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-zinc-500">
        Loading…
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
        <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
          ← Home
        </Link>
        <h1 className="font-display mt-6 text-2xl font-bold text-foreground">Account deletion</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Permanently delete your Get Vaulted account and sign out on all devices.
        </p>
        <PublicAccountDeletionInfo />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
      <Link href="/account" className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
        ← My Account
      </Link>
      <h1 className="font-display mt-6 text-2xl font-bold text-foreground">Delete account</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        Deleting your account anonymizes your profile, revokes sign-in, and disconnects seller payout settings.
        Financial and compliance records may be retained where legally required. This action is irreversible.
      </p>

      <section className="mt-8 rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold text-foreground">Requirements</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
          {DELETION_REQUIREMENTS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {loading ? <p className="mt-6 text-sm text-zinc-500">Checking your account…</p> : null}
      {error ? (
        <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </p>
      ) : null}

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
          autoComplete="off"
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

      <p className="mt-6 text-xs leading-relaxed text-zinc-500">
        Questions? Email{" "}
        <a href="mailto:support@shopgetvaulted.com" className="text-gold-bright hover:underline">
          support@shopgetvaulted.com
        </a>
        .
      </p>
    </main>
  );
}
