"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import type { QaSessionDebugPayload } from "@/lib/build-qa-session-debug";

type AuthConfig = {
  projectRef: string | null;
  alignedWithBeta: boolean;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-white/45">{label}</div>
      <div className="mt-1 break-all font-mono text-sm text-white/90">{value}</div>
    </div>
  );
}

export function QaDiagnosticsPanel() {
  const { data: session, status } = useSession();
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [debug, setDebug] = useState<QaSessionDebugPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [cfgRes, dbgRes] = await Promise.all([
        fetch("/api/auth/config", { cache: "no-store" }),
        fetch("/api/qa/session-debug", { cache: "no-store", credentials: "include" }),
      ]);
      if (cfgRes.ok) setAuthConfig((await cfgRes.json()) as AuthConfig);
      if (!dbgRes.ok) {
        const body = await dbgRes.text();
        throw new Error(`session-debug ${dbgRes.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
      }
      setDebug((await dbgRes.json()) as QaSessionDebugPayload);
    } catch (e) {
      setDebug(null);
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, status]);

  const apiBase =
    typeof window !== "undefined" ? `${window.location.origin}` : "(server)";

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6 text-white">
      <h1 className="text-2xl font-bold">QA environment diagnostics</h1>
      <p className="text-sm text-white/60">
        Run <code className="text-amber-200">npm run qa:local-env-check</code> in{" "}
        <code className="text-amber-200">web/</code> before manual QA. Clear session on every client when refs or rooms disagree.
      </p>

      <Row label="Web API base (this tab)" value={apiBase} />
      <Row
        label="Supabase project ref (web env)"
        value={authConfig?.projectRef ?? "loading…"}
      />
      <Row
        label="Beta aligned"
        value={authConfig?.alignedWithBeta ? "yes" : "no"}
      />
      <Row label="NextAuth status" value={status} />
      <Row label="Logged-in email" value={session?.user?.email ?? "(signed out)"} />
      <Row label="NextAuth user id (Prisma)" value={session?.user?.id ?? "—"} />

      {busy ? <p className="text-sm text-white/50">Refreshing…</p> : null}
      {err ? <p className="text-sm text-red-300">{err}</p> : null}

      {debug ? (
        <>
          <Row
            label="Canonical Prisma user id"
            value={debug.identityConsistency.canonicalPrismaUserId ?? debug.session.prismaUserId ?? "—"}
          />
          <Row label="Session source" value={debug.session.sessionSource ?? "—"} />
          {debug.identityConsistency.warning ? (
            <p className="text-sm text-amber-300">{debug.identityConsistency.warning}</p>
          ) : null}
          <Row
            label="Seller readiness"
            value={debug.sellerReadiness?.summary ?? "(not seller / signed out)"}
          />
          <Row
            label="Stripe account id"
            value={debug.sellerReadiness?.stripeAccountId ?? "—"}
          />
          <Row
            label="Public live rooms (DB)"
            value={`${debug.liveDiscovery.publicRoomCount} · seller rooms ${debug.liveDiscovery.sellerRoomCount ?? "n/a"}`}
          />
          <Row label="Room discovery source" value={debug.liveDiscovery.source} />
          <Row label="DB project ref" value={debug.environment.databaseProjectRef ?? "—"} />
        </>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10"
          onClick={() => void load()}
        >
          Refresh
        </button>
        <button
          type="button"
          className="rounded-md border border-red-400/40 bg-red-950/40 px-4 py-2 text-sm font-semibold text-red-200"
          onClick={() => void signOut({ callbackUrl: "/signin" })}
        >
          Clear QA session (sign out)
        </button>
      </div>
    </div>
  );
}
