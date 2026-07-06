"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminCommandShell,
  adminButtonPrimaryClassName,
  adminPanelClassName,
  adminTableClassName,
} from "@/components/admin/AdminCommandShell";
import { MASS_NOTIFICATION_BODY_MAX, MASS_NOTIFICATION_TITLE_MAX } from "@/lib/admin/mass-notification";

type BroadcastRow = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  audience: string;
  recipientCount: number;
  pushSentCount: number;
  createdByUsername: string | null;
  createdAt: string;
};

const inputClassName =
  "mt-1.5 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2.5 text-sm text-zinc-100 outline-none ring-gold/30 focus:border-gold/40 focus:ring-2";

export function AdminNotificationsPage() {
  const [history, setHistory] = useState<BroadcastRow[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // One idempotency key per compose+send attempt: generated when the confirm step opens, reused
  // across retries of that same attempt (e.g. a slow/failed request re-clicked), and regenerated
  // whenever the admin starts a fresh "Review & send" — so a duplicate submit of the same intent
  // is safely deduped server-side instead of fanning out a second broadcast to every user.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/admin/notifications/broadcast", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as { broadcasts: BroadcastRow[] };
        setHistory(json.broadcasts);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const canSubmit = trimmedTitle.length > 0 && trimmedBody.length > 0 && !sending;

  const requestSend = () => {
    setError(null);
    setSuccess(null);
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    if (!trimmedBody) {
      setError("Message is required.");
      return;
    }
    setIdempotencyKey(
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    setConfirming(true);
  };

  const confirmSend = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          body: trimmedBody,
          href: href.trim() || undefined,
          idempotencyKey,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        recipientCount?: number;
        pushSentCount?: number;
      };
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Could not send notification.");
        return;
      }
      setSuccess(
        `Sent to ${json.recipientCount ?? 0} users (${json.pushSentCount ?? 0} devices received a push).`,
      );
      setTitle("");
      setBody("");
      setHref("");
      setIdempotencyKey(null);
      await loadHistory();
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  return (
    <AdminCommandShell
      title="Mass Notifications"
      subtitle="Push a title, message, and optional link out to every active user — for upcoming live shows, drops, and deals. Sends immediately to everyone; there's no scheduling or audience targeting yet."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${adminPanelClassName} p-5`}>
          <h2 className="text-sm font-bold text-gold-bright">Compose broadcast</h2>

          {!confirming ? (
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Title
                  <span className="font-mono text-[10px] normal-case text-zinc-600">
                    {trimmedTitle.length}/{MASS_NOTIFICATION_TITLE_MAX}
                  </span>
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={MASS_NOTIFICATION_TITLE_MAX}
                  placeholder="Big break tonight at 8pm ET"
                  className={inputClassName}
                />
              </label>
              <label className="block">
                <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Message
                  <span className="font-mono text-[10px] normal-case text-zinc-600">
                    {trimmedBody.length}/{MASS_NOTIFICATION_BODY_MAX}
                  </span>
                </span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={MASS_NOTIFICATION_BODY_MAX}
                  rows={4}
                  placeholder="Doors open at 8pm ET — new team breaks and marketplace deals all night."
                  className={`${inputClassName} resize-none`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Link (optional)</span>
                <input
                  value={href}
                  onChange={(e) => setHref(e.target.value)}
                  placeholder="/live or https://shopgetvaulted.com/live"
                  className={inputClassName}
                />
                <span className="mt-1 block text-[11px] text-zinc-600">
                  Opens when the notification is tapped. Defaults to the home feed if left blank.
                </span>
              </label>
              {error ? <p className="text-sm text-rose-400">{error}</p> : null}
              {success ? <p className="text-sm text-emerald-400">{success}</p> : null}
              <button
                type="button"
                disabled={!canSubmit}
                onClick={requestSend}
                className={`${adminButtonPrimaryClassName} px-4 py-2.5 text-sm`}
              >
                Review &amp; send to everyone
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-300">Confirm send</p>
                <p className="mt-2 text-sm text-zinc-200">
                  This sends immediately to <span className="font-bold">every active user</span> as a push
                  notification and inbox message. This can&apos;t be undone.
                </p>
                <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
                  <p className="text-sm font-bold text-zinc-100">{trimmedTitle}</p>
                  <p className="mt-1 text-sm text-zinc-400">{trimmedBody}</p>
                  {href.trim() ? <p className="mt-1 text-xs text-gold-bright">{href.trim()}</p> : null}
                </div>
              </div>
              {error ? <p className="text-sm text-rose-400">{error}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => void confirmSend()}
                  className="rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-black disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Yes, send now"}
                </button>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => setConfirming(false)}
                  className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-white/[0.04] disabled:opacity-50"
                >
                  Back to edit
                </button>
              </div>
            </div>
          )}
        </section>

        <section className={`${adminPanelClassName} p-5`}>
          <h2 className="text-sm font-bold text-gold-bright">Recent broadcasts</h2>
          <div className="mt-4 overflow-x-auto">
            {loadingHistory ? (
              <p className="text-sm text-zinc-500">Loading history…</p>
            ) : history && history.length > 0 ? (
              <table className={adminTableClassName}>
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    <th>Sent</th>
                    <th>Title</th>
                    <th>Reach</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id} className="border-t border-white/[0.04] align-top text-zinc-300">
                      <td className="whitespace-nowrap text-xs text-zinc-500">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td>
                        <p className="font-semibold text-zinc-100">{row.title}</p>
                        <p className="mt-0.5 max-w-xs text-xs text-zinc-500">{row.body}</p>
                        {row.href ? <p className="mt-0.5 text-[11px] text-gold-bright">{row.href}</p> : null}
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {row.recipientCount} users
                        <br />
                        <span className="text-zinc-600">{row.pushSentCount} pushes</span>
                      </td>
                      <td className="whitespace-nowrap text-xs text-zinc-500">
                        {row.createdByUsername ? `@${row.createdByUsername}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-zinc-500">No broadcasts sent yet.</p>
            )}
          </div>
        </section>
      </div>
    </AdminCommandShell>
  );
}
