"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

type ThreadMeta = {
  id: string;
  listingId: string;
  listingTitle: string;
  otherUserId: string;
  otherUsername: string;
};

type Msg = {
  id: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

function formatMsgTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function AccountThreadPage({ threadId }: { threadId: string }) {
  const { data: session, status } = useSession();
  const uid = session?.user?.id;
  const [pageState, setPageState] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ThreadMeta | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setPageState("loading");
    setLoadError(null);
    const res = await fetch(`/api/account/threads/${encodeURIComponent(threadId)}`);
    if (!res.ok) {
      setLoadError(res.status === 404 ? "Conversation not found." : "Could not load messages.");
      setMeta(null);
      setMessages([]);
      setPageState("error");
      return;
    }
    const data = (await res.json()) as { thread?: ThreadMeta; messages?: Msg[] };
    setMeta(data.thread ?? null);
    setMessages(Array.isArray(data.messages) ? data.messages : []);
    setPageState("ready");
    window.dispatchEvent(new Event("gv-messages-updated"));
  }, [threadId]);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [load, status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/account/threads/${encodeURIComponent(threadId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: Msg };
      if (!res.ok) {
        setSendError(typeof data.error === "string" ? data.error : "Send failed.");
        return;
      }
      if (data.message) {
        setMessages((m) => [...m, data.message as Msg]);
        setDraft("");
      } else {
        await load();
      }
      window.dispatchEvent(new Event("gv-messages-updated"));
    } finally {
      setSending(false);
    }
  };

  if (status === "loading" || (status === "authenticated" && pageState === "loading")) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-zinc-500">Loading conversation…</div>
    );
  }

  if (pageState === "error" || !meta) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-sm text-zinc-400">{loadError ?? "Not found."}</p>
        <Link href="/account/messages" className="text-sm font-semibold text-gold-bright hover:underline">
          Back to inbox
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="border-b border-white/[0.08] px-3 py-2.5 md:hidden">
        <p className="text-xs font-semibold text-zinc-200">@{meta.otherUsername}</p>
        <Link
          href={`/marketplace/${encodeURIComponent(meta.listingId)}`}
          className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500 hover:text-gold-bright"
        >
          {meta.listingTitle}
        </Link>
      </div>

      <div className="hidden border-b border-white/[0.08] px-4 py-3 md:block">
        <p className="text-xs font-semibold text-zinc-200">@{meta.otherUsername}</p>
        <Link
          href={`/marketplace/${encodeURIComponent(meta.listingId)}`}
          className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500 hover:text-gold-bright"
        >
          {meta.listingTitle}
        </Link>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-600">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === uid;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[min(100%,28rem)] rounded-2xl border px-3.5 py-2.5 text-sm leading-relaxed ${
                    mine
                      ? "border-gold/25 bg-gold/[0.08] text-zinc-100"
                      : "border-white/[0.1] bg-white/[0.03] text-zinc-200"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-1.5 text-[10px] tabular-nums ${mine ? "text-zinc-500" : "text-zinc-600"}`}>
                    {formatMsgTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-white/[0.08] bg-[#060608] p-3 sm:p-4">
        {sendError ? <p className="mb-2 text-xs font-medium text-rose-300">{sendError}</p> : null}
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSendError(null);
            }}
            rows={2}
            placeholder="Write a reply…"
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-foreground outline-none focus:border-gold/35"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            disabled={sending || !draft.trim()}
            onClick={() => void send()}
            className="h-auto shrink-0 self-end rounded-xl bg-gradient-to-r from-gold to-gold-bright px-4 py-2 text-xs font-bold text-zinc-950 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}
