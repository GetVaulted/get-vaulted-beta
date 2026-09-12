"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MentionComposer } from "@/components/mentions/MentionComposer";
import { MentionText } from "@/components/mentions/MentionText";
import type { MessageMentionDTO } from "@/lib/mentions/mention-types";

type ThreadMeta = {
  id: string;
  listingId: string;
  listingTitle: string;
  otherUserId: string;
  otherUsername: string;
  inbox?: "primary" | "request";
  isSeller?: boolean;
};

type Msg = {
  id: string;
  senderId: string;
  body: string;
  imageUrl?: string | null;
  readAt: string | null;
  createdAt: string;
  mentions?: MessageMentionDTO[];
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Loading OLDER messages prepends to the list and must not yank the view to the bottom —
  // only initial load / new sends should auto-scroll down.
  const scrollToBottomOnNextRenderRef = useRef(true);

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
    const data = (await res.json()) as {
      thread?: ThreadMeta;
      messages?: Msg[];
      hasMore?: boolean;
      nextCursor?: string | null;
    };
    setMeta(data.thread ?? null);
    scrollToBottomOnNextRenderRef.current = true;
    setMessages(Array.isArray(data.messages) ? data.messages : []);
    setHasMoreOlder(Boolean(data.hasMore));
    setOlderCursor(data.nextCursor ?? null);
    setPageState("ready");
    window.dispatchEvent(new Event("gv-messages-updated"));
  }, [threadId]);

  const loadOlder = useCallback(async () => {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/account/threads/${encodeURIComponent(threadId)}?before=${encodeURIComponent(olderCursor)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: Msg[]; hasMore?: boolean; nextCursor?: string | null };
      const older = Array.isArray(data.messages) ? data.messages : [];
      scrollToBottomOnNextRenderRef.current = false;
      setMessages((m) => [...older, ...m]);
      setHasMoreOlder(Boolean(data.hasMore));
      setOlderCursor(data.nextCursor ?? null);
    } finally {
      setLoadingOlder(false);
    }
  }, [threadId, olderCursor, loadingOlder]);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [load, status]);

  useEffect(() => {
    if (!scrollToBottomOnNextRenderRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const clearPendingImage = useCallback(() => {
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPendingImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const pickImage = (file: File | null) => {
    setSendError(null);
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setSendError("Use JPG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setSendError("Photo must be 8MB or smaller.");
      return;
    }
    setPendingImageFile(file);
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const send = async () => {
    const text = draft.trim();
    if ((!text && !pendingImageFile) || sending) return;
    setSending(true);
    setSendError(null);
    try {
      let imageUrl: string | undefined;
      if (pendingImageFile) {
        const form = new FormData();
        form.append("file", pendingImageFile);
        const uploadRes = await fetch("/api/uploads/message-image", { method: "POST", body: form });
        const uploadData = (await uploadRes.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!uploadRes.ok || !uploadData.url) {
          setSendError(typeof uploadData.error === "string" ? uploadData.error : "Photo upload failed.");
          return;
        }
        imageUrl = uploadData.url;
      }
      const res = await fetch(`/api/account/threads/${encodeURIComponent(threadId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, ...(imageUrl ? { imageUrl } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: Msg };
      if (!res.ok) {
        setSendError(typeof data.error === "string" ? data.error : "Send failed.");
        return;
      }
      if (data.message) {
        scrollToBottomOnNextRenderRef.current = true;
        setMessages((m) => [...m, data.message as Msg]);
        setDraft("");
        clearPendingImage();
      } else {
        await load();
      }
      window.dispatchEvent(new Event("gv-messages-updated"));
    } finally {
      setSending(false);
    }
  };

  const acceptRequest = async () => {
    const res = await fetch(`/api/account/threads/${encodeURIComponent(threadId)}/actions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept_request" }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setSendError(typeof data.error === "string" ? data.error : "Could not accept request.");
      return;
    }
    await load();
    window.dispatchEvent(new Event("gv-messages-updated"));
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

      {meta.inbox === "request" && meta.isSeller ? (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <p className="text-xs text-amber-100/90">
            Message request — accept to move it to your inbox, or just reply (that accepts automatically).
          </p>
          <button
            type="button"
            onClick={() => void acceptRequest()}
            className="mt-2 inline-flex h-9 items-center rounded-full bg-gold px-4 text-xs font-bold text-zinc-950"
          >
            Accept request
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4">
        {hasMoreOlder ? (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={loadingOlder}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
            >
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        ) : null}
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
                  {m.imageUrl ? (
                    <a href={m.imageUrl} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- DM photos are user-uploaded, arbitrary Supabase URLs; next/image domain allowlist doesn't fit a per-message host. */}
                      <img
                        src={m.imageUrl}
                        alt="Attached photo"
                        className={`max-h-72 w-full max-w-[16rem] rounded-xl object-cover ${m.body ? "mb-2" : ""}`}
                        loading="lazy"
                      />
                    </a>
                  ) : null}
                  {m.body ? (
                    <p className="whitespace-pre-wrap break-words">
                      <MentionText body={m.body} mentions={m.mentions} />
                    </p>
                  ) : null}
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
        {meta.inbox === "request" && !meta.isSeller ? (
          <p className="mb-2 text-xs text-zinc-500">
            Waiting for them to accept your message request (or reply — that also opens the chat).
          </p>
        ) : null}
        {sendError ? <p className="mb-2 text-xs font-medium text-rose-300">{sendError}</p> : null}
        {pendingImagePreviewUrl ? (
          <div className="mb-2 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not a remote asset. */}
            <img
              src={pendingImagePreviewUrl}
              alt="Selected photo preview"
              className="h-16 w-16 rounded-lg object-cover"
            />
            <button
              type="button"
              onClick={clearPendingImage}
              className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-300"
            >
              Remove photo
            </button>
          </div>
        ) : null}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              pickImage(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || (meta.inbox === "request" && !meta.isSeller)}
            aria-label="Attach photo"
            className="flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-xl border border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16.5V6.75A2.75 2.75 0 0 1 6.75 4h10.5A2.75 2.75 0 0 1 20 6.75v10.5A2.75 2.75 0 0 1 17.25 20H6.75A2.75 2.75 0 0 1 4 17.25Zm0 0-.94-.94a1.5 1.5 0 0 1 0-2.12l4.24-4.25a1.5 1.5 0 0 1 2.12 0L12 12.25l3.44-3.44a1.5 1.5 0 0 1 2.12 0L20 11.25"
              />
              <circle cx="8.25" cy="8.25" r="1.25" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <MentionComposer
            value={draft}
            onChange={(v) => {
              setDraft(v);
              setSendError(null);
            }}
            rows={2}
            maxLength={8000}
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
            disabled={
              sending ||
              (!draft.trim() && !pendingImageFile) ||
              (meta.inbox === "request" && !meta.isSeller)
            }
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
