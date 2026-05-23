"use client";

import { useEffect, useMemo, useRef } from "react";
import type { LiveRoomMessageDTO } from "@/lib/live-room-serialize";

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
  messages: LiveRoomMessageDTO[];
  systemMsg: string;
  onSystemMsgChange: (v: string) => void;
  onSendSystem: () => void;
  busy: boolean;
  /** `sidebar` = full-height desktop left column; `overlay` = mobile/in-stage panel. */
  variant?: "sidebar" | "overlay";
};

export function VaultHostLiveChatPanel({
  messages,
  systemMsg,
  onSystemMsgChange,
  onSendSystem,
  busy,
  variant = "overlay",
}: VaultHostLiveChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatMessages = useMemo(() => messages.filter((m) => m.messageType !== "bid"), [messages]);
  const visibleMessages = useMemo(() => chatMessages.slice(-120), [chatMessages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom || visibleMessages.length <= 1) {
      el.scrollTop = el.scrollHeight;
    }
  }, [visibleMessages]);

  const shellClass =
    variant === "sidebar"
      ? "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      : "pointer-events-auto flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-black/55 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.05] backdrop-blur-[var(--live-blur-xl)]";

  return (
    <div className={shellClass}>
      <div className="shrink-0 border-b border-white/[0.08] px-3 py-2">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Live Chat</p>
      </div>

      <div
        ref={scrollRef}
        data-testid="host-live-chat-messages"
        className="chat-messages min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-2 [-webkit-overflow-scrolling:touch] touch-pan-y"
      >
        {visibleMessages.length === 0 ? (
          <p className="py-8 text-center text-xs font-medium text-zinc-500">No chat messages yet.</p>
        ) : (
          visibleMessages.map((m) => {
            const label = chatLabelForMessage(m);
            const labelClass = chatLabelClassForMessage(m);
            const isSystem = m.messageType === "system";
            return (
              <div key={m.id} className="text-[13px] leading-snug max-[380px]:text-[12px]">
                <span className={labelClass}>{label}</span>
                <span className="text-zinc-600">: </span>
                <span className={isSystem ? "text-zinc-100" : "text-zinc-300"}>{m.body}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 border-t border-amber-400/15 bg-gradient-to-br from-amber-500/10 via-black/50 to-black/65 p-2.5">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-100/85">Live broadcast</p>
        <textarea
          value={systemMsg}
          onChange={(e) => onSystemMsgChange(e.target.value)}
          placeholder="Push a line to the room…"
          rows={2}
          className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-[11px] text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-400/35"
        />
        <button
          type="button"
          disabled={busy || !systemMsg.trim()}
          onClick={onSendSystem}
          className="mt-2 w-full rounded-lg bg-gradient-to-r from-amber-500/90 to-yellow-400/90 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] disabled:opacity-40"
        >
          Send to chat
        </button>
      </div>
    </div>
  );
}
