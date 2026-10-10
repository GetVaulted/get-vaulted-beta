"use client";

import { useCallback, useEffect, useState } from "react";
import { adminButtonPrimaryClassName, adminPanelClassName } from "@/components/admin/AdminCommandShell";

type Note = { id: string; body: string; author: string; createdAt: string };

/** Private notes on a user, order, show, refund request, dispute or ticket. Members never see these. */
export function AdminNotesPanel({ targetType, targetId }: { targetType: string; targetId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/notes?type=${encodeURIComponent(targetType)}&id=${encodeURIComponent(targetId)}`, {
      cache: "no-store",
    });
    if (res.ok) setNotes(((await res.json()) as { notes: Note[] }).notes);
  }, [targetType, targetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: targetType, id: targetId, body: text }),
      });
      if (res.ok) {
        setText("");
        await load();
      } else setErr("Could not save the note.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${adminPanelClassName} p-4 text-xs`}>
      <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Internal notes (private)</h2>
      {notes.length === 0 ? (
        <p className="mt-3 text-zinc-600">No notes yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="border-b border-white/[0.05] pb-2">
              <p className="whitespace-pre-wrap text-zinc-200">{n.body}</p>
              <p className="text-zinc-600">
                @{n.author} · {new Date(n.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="New note"
        placeholder="Add a note for the team"
        rows={2}
        className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
      />
      <button type="button" disabled={busy || text.trim().length < 2} onClick={() => void add()} className={`mt-2 ${adminButtonPrimaryClassName}`}>
        {busy ? "Saving…" : "Add note"}
      </button>
      {err ? <p className="mt-2 text-rose-300">{err}</p> : null}
    </section>
  );
}

/** Send one member a message (in-app + push). Shows a confirm step; logged with a reason. */
export function AdminMessageUserPanel({ userId, username }: { userId: string; username?: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const ready = title.trim().length > 0 && body.trim().length > 0 && reason.trim().length >= 5;

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, reason }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setMsg({ ok: true, text: "Sent." });
        setTitle("");
        setBody("");
        setReason("");
        setConfirming(false);
      } else {
        setMsg({ ok: false, text: `Failed: ${j.error ?? res.status}` });
        setConfirming(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${adminPanelClassName} p-4 text-xs`}>
      <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Message this member</h2>
      <p className="mt-2 text-zinc-500">Shows in their notifications and sends a push. Use it for support follow-ups.</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Message title"
        placeholder="Title"
        maxLength={120}
        className="mt-3 w-full rounded-lg border border-white/10 bg-[#050506] px-3 py-1.5 text-zinc-200"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Message body"
        placeholder="Message"
        rows={3}
        maxLength={1000}
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground"
      />
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label="Reason"
        placeholder="Why you're sending this (saved to the activity log)"
        className="mt-2 w-full rounded-lg border border-white/10 bg-[#050506] px-3 py-1.5 text-zinc-200"
      />
      {confirming ? (
        <div className="mt-3 rounded-lg border border-gold/30 bg-gold/[0.06] p-3 text-zinc-200">
          <p>Send this to @{username ?? "this member"} now? They will see it right away.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void send()} className={adminButtonPrimaryClassName}>
              {busy ? "Sending…" : "Yes, send"}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="px-3 text-zinc-400 hover:text-zinc-200">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!ready} onClick={() => setConfirming(true)} className={`mt-3 ${adminButtonPrimaryClassName}`}>
          Review &amp; send
        </button>
      )}
      {msg ? <p className={`mt-2 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p> : null}
    </section>
  );
}
