"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveRoomMessageDTO } from "@/lib/live-room-serialize";
import { LiveChatMessageRowActions } from "@/components/trust/LiveChatMessageRowActions";

const PALETTE = ["text-sky-400", "text-emerald-400", "text-violet-400", "text-amber-400", "text-rose-400", "text-cyan-400"] as const;

function colorForUser(username: string | undefined) {
  const u = username ?? "";
  let h = 0;
  for (let i = 0; i < u.length; i++) h = (h + u.charCodeAt(i) * 13) % 1000;
  return PALETTE[h % PALETTE.length];
}

function isNamedSystemMessage(m: LiveRoomMessageDTO) {
  return m.messageType === "system" && Boolean(m.senderUsername) && m.senderUsername !== "System";
}

function chatLabelForMessage(m: LiveRoomMessageDTO) {
  if (isNamedSystemMessage(m)) return m.senderUsername as string;
  if (m.messageType === "system") return "System";
  if (m.messageType === "purchase") return "Event";
  return m.senderUsername ?? "User";
}

function chatLabelClassForMessage(m: LiveRoomMessageDTO) {
  if (isNamedSystemMessage(m)) return `font-bold ${colorForUser(m.senderUsername)}`;
  if (m.messageType === "system") return "font-bold text-amber-200/95";
  if (m.messageType === "purchase") return "font-bold text-emerald-300/95";
  return `font-bold ${colorForUser(m.senderUsername)}`;
}

type VaultHostLiveChatPanelProps = {
  liveRoomId: string;
  hostUserId: string;
  messages: LiveRoomMessageDTO[];
  systemMsg: string;
  onSystemMsgChange: (v: string) => void;
  onSendSystem: () => void;
  busy: boolean;
  viewerCount?: number;
  onMessagesRefresh?: () => void;
  /** `sidebar` = full-height desktop column; `overlay` = mobile/in-stage panel. */
  variant?: "sidebar" | "overlay";
};

export function VaultHostLiveChatPanel({
  liveRoomId,
  hostUserId,
  messages,
  systemMsg,
  onSystemMsgChange,
  onSendSystem,
  busy,
  viewerCount = 0,
  onMessagesRefresh,
  variant = "overlay",
}: VaultHostLiveChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"chat" | "watching">("chat");
  const chatMessages = useMemo(() => messages.filter((m) => m.messageType !== "bid"), [messages]);
  const visibleMessages = useMemo(() => chatMessages.slice(-120), [chatMessages]);

  const recentChatters = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (let i = chatMessages.length - 1; i >= 0 && out.length < 24; i--) {
      const u = chatMessages[i]?.senderUsername?.trim();
      if (!u || u === "System" || seen.has(u.toLowerCase())) continue;
      seen.add(u.toLowerCase());
      out.push(u);
    }
    return out;
  }, [chatMessages]);

  useEffect(() => {
    if (tab !== "chat") return;
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom || visibleMessages.length <= 1) {
      el.scrollTop = el.scrollHeight;
    }
  }, [visibleMessages, tab]);

  const shellClass =
    variant === "sidebar"
      ? "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-transparent"
      : "pointer-events-auto flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-black/55 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.05] backdrop-blur-[var(--live-blur-xl)]";

  const showTabs = variant === "sidebar";
  const msgClass = variant === "sidebar" ? "text-[14px] leading-relaxed" : "text-[13px] leading-snug max-[380px]:text-[12px]";
  const msgListClass = variant === "sidebar" ? "space-y-2.5 px-3.5 py-3" : "space-y-2 px-3 py-2";

  return (
    <div className={shellClass}>
      {showTabs ? (
        <div className="shrink-0 border-b border-white/[0.06] px-2.5 py-2">
          <div className="live-stage-glass-tray flex gap-1 p-0.5">
            <button
              type="button"
              onClick={() => setTab("chat")}
              className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] transition ${
                tab === "chat" ? "bg-zinc-700/90 text-zinc-50 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setTab("watching")}
              className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] transition ${
                tab === "watching" ? "bg-zinc-700/90 text-zinc-50 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Watching
            </button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-b border-white/[0.08] px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Live Chat</p>
        </div>
      )}

      {(showTabs ? tab === "chat" : true) ? (
        <>
          <div
            ref={scrollRef}
            data-testid="host-live-chat-messages"
            className={`chat-messages min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch] touch-pan-y ${msgListClass}`}
          >
            {visibleMessages.length === 0 ? (
              <p className="py-8 text-center text-xs font-medium text-zinc-500">No chat messages yet.</p>
            ) : (
              visibleMessages.map((m) => {
                const label = chatLabelForMessage(m);
                const labelClass = chatLabelClassForMessage(m);
                const isSystem = m.messageType === "system";
                return (
                  <div key={m.id} className={`group chat-msg-row ${msgClass}`}>
                    <span className={labelClass}>{label}</span>
                    <span className="text-zinc-600">: </span>
                    <span className={isSystem ? "text-zinc-100" : "text-zinc-300"}>{m.body}</span>
                    {m.messageType === "chat" && m.senderId !== hostUserId ? (
                      <LiveChatMessageRowActions
                        liveRoomId={liveRoomId}
                        messageId={m.id}
                        senderId={m.senderId}
                        senderUsername={m.senderUsername}
                        canModerate
                        onModerationComplete={() => onMessagesRefresh?.()}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className={`shrink-0 border-t border-white/[0.06] ${variant === "sidebar" ? "live-stage-glass-tray m-2 p-2" : "bg-zinc-900/50 p-3"}`}>
            <textarea
              value={systemMsg}
              onChange={(e) => onSystemMsgChange(e.target.value)}
              placeholder="Send to chat…"
              rows={2}
              className={`w-full resize-none rounded-lg border border-white/10 bg-black/55 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-400/35 ${
                variant === "sidebar" ? "px-3 py-2.5 text-[13px]" : "px-2.5 py-2 text-[12px]"
              }`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!busy && systemMsg.trim()) onSendSystem();
                }
              }}
            />
            <button
              type="button"
              disabled={busy || !systemMsg.trim()}
              onClick={onSendSystem}
              className="mt-2 w-full rounded-lg bg-gradient-to-r from-amber-500/90 to-yellow-400/90 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] disabled:opacity-40"
            >
              Send to chat
            </button>
          </div>
        </>
      ) : showTabs ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">In the room</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-zinc-100">{viewerCount.toLocaleString()}</p>
          <p className="text-xs text-zinc-500">viewers watching now</p>
          {recentChatters.length > 0 ? (
            <div className="mt-4 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">Recent in chat</p>
              {recentChatters.map((u) => (
                <p key={u} className={`text-sm font-semibold ${colorForUser(u)}`}>
                  @{u}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-center text-xs text-zinc-600">Viewer names appear as chat activity picks up.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
