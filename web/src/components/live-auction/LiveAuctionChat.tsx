"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveRoomMessageDTO } from "@/lib/live-room-serialize";
import { appendLiveRoomMessageDedupe } from "@/lib/realtime-merge-messages";
import { useLiveRoomModerationState } from "@/hooks/useLiveRoomModerationState";
import { LiveChatMessageRowActions } from "@/components/trust/LiveChatMessageRowActions";
import { LiveChatAvatar } from "@/components/live-auction/LiveChatAvatar";
import { MentionComposer } from "@/components/mentions/MentionComposer";
import { MentionText } from "@/components/mentions/MentionText";

function PinnedChatBar({
  message,
  username,
  avatarUrl,
  compact,
}: {
  message: string;
  username: string;
  avatarUrl?: string | null;
  compact?: boolean;
}) {
  return (
    <div className={`pointer-events-none shrink-0 ${compact ? "px-1 pt-1" : "px-2 pt-1"}`}>
      <div
        className={`flex items-start gap-2 rounded-xl border border-white/20 bg-black/50 backdrop-blur-sm ${
          compact ? "px-2 py-1.5" : "px-2.5 py-2"
        }`}
      >
        <LiveChatAvatar
          username={username}
          avatarUrl={avatarUrl}
          size={24}
          isModerator
          className="mt-0.5 shrink-0"
        />
        <p className={`min-w-0 flex-1 leading-snug [text-shadow:0_1px_2px_rgba(0,0,0,0.95)] ${compact ? "text-[12px]" : "text-[13px]"}`}>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="font-extrabold text-white">{username}</span>
            <span className="inline-flex rounded bg-zinc-500/90 px-1 py-0.5 text-[9px] font-bold leading-none text-white">
              Mod
            </span>
          </span>
          <span className="mt-0.5 block font-medium text-zinc-50">{message}</span>
        </p>
      </div>
    </div>
  );
}

const PALETTE = ["text-sky-400", "text-emerald-400", "text-violet-400", "text-amber-400", "text-rose-400", "text-cyan-400"] as const;

function colorForUser(username: string | undefined) {
  const u = username ?? "";
  let h = 0;
  for (let i = 0; i < u.length; i++) h = (h + u.charCodeAt(i) * 13) % 1000;
  return PALETTE[h % PALETTE.length];
}

/** System rows whose `senderUsername` is not the literal "System" (e.g. arena join/leave). */
function isNamedSystemMessage(m: LiveRoomMessageDTO) {
  return m.messageType === "system" && Boolean(m.senderUsername) && m.senderUsername !== "System";
}

function chatLabelForMessage(m: LiveRoomMessageDTO) {
  if (isNamedSystemMessage(m)) return m.senderUsername as string;
  if (m.messageType === "system") return "System";
  if (m.messageType === "purchase") return "Event";
  return m.senderUsername ?? "User";
}

function chatLabelClassForMessage(
  m: LiveRoomMessageDTO,
  compact: boolean,
  hostUserId?: string | null,
  moderators: { userId: string }[] = [],
) {
  const fw = compact ? "font-extrabold" : "font-bold";
  if (hostUserId && m.senderId === hostUserId && m.messageType === "chat") return `${fw} text-amber-300/95`;
  if (isModeratorChatMessage(m, moderators) && m.senderId !== hostUserId) return `${fw} text-violet-300/95`;
  if (isNamedSystemMessage(m)) return `${fw} ${colorForUser(m.senderUsername)}`;
  if (m.messageType === "system") return `${fw} text-amber-200/95`;
  if (m.messageType === "purchase") return `${fw} text-emerald-300/95`;
  return `${fw} text-zinc-100`;
}

function isHostChatMessage(m: LiveRoomMessageDTO, hostUserId: string | null) {
  return m.messageType === "chat" && Boolean(hostUserId && m.senderId === hostUserId);
}

function isModeratorChatMessage(
  m: LiveRoomMessageDTO,
  moderators: { userId: string }[],
) {
  return m.messageType === "chat" && moderators.some((mod) => mod.userId === m.senderId);
}

function shouldShowChatAvatar(m: LiveRoomMessageDTO) {
  return m.messageType === "chat" || isNamedSystemMessage(m);
}

type LiveAuctionChatProps = {
  liveRoomId: string;
  messages: LiveRoomMessageDTO[];
  onMessagesChange: (next: LiveRoomMessageDTO[] | ((prev: LiveRoomMessageDTO[]) => LiveRoomMessageDTO[])) => void;
  /** When true, omit outer chrome so the parent panel supplies border/radius (e.g. host console). */
  embedded?: boolean;
  /** Smaller in-video treatment. */
  compact?: boolean;
  /** Bare livestream overlay mode (no panel chrome). */
  overlayMode?: boolean;
  /**
   * When false (desktop host console), message list does not use its own scroll area — the page scrolls instead.
   * Default true for buyer / overlay chat.
   */
  scrollMessages?: boolean;
  /** Host/seller user id — never show mod/report actions on host rows. */
  hostUserId?: string | null;
  onMessagesRefresh?: () => void;
};

export function LiveAuctionChat({
  liveRoomId,
  messages,
  onMessagesChange,
  embedded,
  compact = false,
  overlayMode = false,
  scrollMessages = true,
  hostUserId = null,
  onMessagesRefresh,
}: LiveAuctionChatProps) {
  const { data: session, status } = useSession();
  const mod = useLiveRoomModerationState(liveRoomId, Boolean(liveRoomId));
  /** Bid lines are not shown in arena chat (bids surface via realtime / UI elsewhere). */
  const chatMessages = useMemo(() => messages.filter((m) => m.messageType !== "bid"), [messages]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const overlayScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = overlayScrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (nearBottom || chatMessages.length <= 1) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || status !== "authenticated") return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, messageType: "chat" }),
      });
      const j = (await res.json().catch(() => ({}))) as { message?: LiveRoomMessageDTO; error?: string };
      if (!res.ok) {
        const err = typeof j.error === "string" ? j.error : "Message could not be sent.";
        setSendError(err);
        mod.handleRestrictionError(err);
        return;
      }
      if (j.message) {
        onMessagesChange((prev) => appendLiveRoomMessageDedupe(prev, j.message!));
        setDraft("");
      } else {
        setSendError("Message could not be sent.");
      }
    } finally {
      setSending(false);
    }
  }, [draft, liveRoomId, mod, onMessagesChange, status]);

  const renderMessageActions = (m: LiveRoomMessageDTO) => {
    if (m.messageType !== "chat") return null;
    if (hostUserId && m.senderId === hostUserId) return null;
    return (
      <LiveChatMessageRowActions
        liveRoomId={liveRoomId}
        messageId={m.id}
        senderId={m.senderId}
        senderUsername={m.senderUsername}
        hostUserId={hostUserId}
        canModerate={mod.canModerate}
        onModerationComplete={() => {
          void mod.reload();
          onMessagesRefresh?.();
        }}
      />
    );
  };

  const blockedBanner =
    mod.roomBlocked || mod.myRestrictions?.roomBanned || mod.myRestrictions?.kickedUntil ? (
      <div className="shrink-0 border-b border-rose-500/30 bg-rose-950/40 px-3 py-2 text-center text-[11px] text-rose-200">
        You cannot participate in this room. Return to{" "}
        <a href="/live" className="font-semibold underline">
          live directory
        </a>
        .
      </div>
    ) : null;

  const panelMessages = useMemo(
    () => (scrollMessages ? chatMessages.slice(-33) : chatMessages.slice(-500)),
    [chatMessages, scrollMessages],
  );

  if (overlayMode) {
    const overlayList = chatMessages.slice(-120);
    const lineShadow =
      "[text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_0_14px_rgba(0,0,0,0.55)]";
    return (
      <div className="pointer-events-none flex h-full min-h-0 w-full min-w-0 flex-col">
        <div className="pointer-events-auto flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
          {blockedBanner}
          <div
            ref={overlayScrollRef}
            data-testid="live-chat-messages"
            className="chat-messages min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain bg-transparent px-1 py-1 [-webkit-overflow-scrolling:touch] touch-pan-y"
          >
            {overlayList.length === 0 ? (
              <div className="space-y-2 pt-1 opacity-40">
                <div className="h-3 w-[88%] rounded-md bg-white/[0.06]" />
                <div className="h-3 w-[62%] rounded-md bg-white/[0.05]" />
              </div>
            ) : null}
            {overlayList.map((m, idx, arr) => {
              const isSystem = m.messageType === "system";
              const label = chatLabelForMessage(m);
              const labelClass = chatLabelClassForMessage(m, true, hostUserId, mod.moderators);
              const isNewest = idx === arr.length - 1;
              const showAvatar = shouldShowChatAvatar(m);
              const isHost = isHostChatMessage(m, hostUserId);
              const isMod = isModeratorChatMessage(m, mod.moderators) && !isHost;
              return (
                <div
                  key={m.id}
                  className={`chat-msg-row group relative flex max-w-[94%] items-start gap-2 text-[13px] leading-snug motion-reduce:animate-none max-[380px]:text-[12px] ${
                    isNewest
                      ? "motion-safe:animate-[live-chat-slide_var(--live-duration-enter)_var(--live-ease)_both]"
                      : "animate-[chat-rise_var(--live-duration-enter)_var(--live-ease)]"
                  }`}
                  style={{ opacity: 0.2 + (idx / Math.max(1, arr.length - 1)) * 0.74 }}
                >
                  {showAvatar ? (
                    <LiveChatAvatar
                      username={m.senderUsername}
                      avatarUrl={m.senderAvatarUrl}
                      size={24}
                      isHost={isHostChatMessage(m, hostUserId)}
                      isModerator={isModeratorChatMessage(m, mod.moderators)}
                      className="mt-0.5 shrink-0"
                    />
                  ) : null}
                  <span className={`inline-block min-w-0 flex-1 ${lineShadow}`}>
                    <span className={labelClass}>{label}</span>
                    {isHost ? (
                      <span className="ml-1 text-[9px] font-black uppercase tracking-wide text-amber-300/90">
                        HOST
                      </span>
                    ) : null}
                    {isMod ? (
                      <span className="ml-1 text-[9px] font-black uppercase tracking-wide text-violet-300/90">
                        MOD
                      </span>
                    ) : null}
                    <span className="text-zinc-400">: </span>
                    <span className={isSystem ? "text-zinc-100" : "text-zinc-50"}>
                      <MentionText body={m.body} mentions={m.mentions} />
                    </span>
                    {renderMessageActions(m)}
                  </span>
                </div>
              );
            })}
          </div>
          {mod.pinnedModeratorMessage ? (
            <PinnedChatBar
              message={mod.pinnedModeratorMessage}
              username={mod.pinnedModeratorUsername ?? "Moderator"}
              avatarUrl={mod.pinnedModeratorAvatarUrl}
              compact
            />
          ) : null}
          <div className="shrink-0 bg-transparent px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5">
            <div className="flex w-full min-w-0 items-center gap-2 rounded-full border border-[color:var(--live-border)] bg-black/35 px-3 py-1 shadow-[var(--live-shadow-rail)] backdrop-blur-[var(--live-blur-xl)]">
              {status === "authenticated" && !mod.myRestrictions?.muted && !mod.roomBlocked ? (
                <>
                  <MentionComposer
                    data-testid="live-chat-input"
                    singleLine
                    value={draft}
                    onChange={(v) => {
                      setDraft(v);
                      setSendError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void send();
                    }}
                    placeholder="Chat…"
                    maxLength={2000}
                    className="h-8 min-w-0 flex-1 bg-transparent px-2 text-[13px] leading-none text-zinc-100 placeholder:text-zinc-500 outline-none max-[380px]:h-7 max-[380px]:text-[12px]"
                  />
                  <button
                    data-testid="live-chat-send"
                    type="button"
                    disabled={sending || !draft.trim()}
                    onClick={() => void send()}
                    className="inline-flex h-8 shrink-0 items-center justify-center self-center rounded-full bg-[#facc15] px-3 text-[10px] font-black uppercase leading-none tracking-wide text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-[transform,opacity] duration-[var(--live-duration-press)] ease-[var(--live-ease)] active:scale-[0.94] disabled:opacity-50 motion-reduce:active:scale-100 max-[380px]:h-7 max-[380px]:px-2.5 max-[380px]:text-[9px]"
                  >
                    Send
                  </button>
                </>
              ) : status === "authenticated" && mod.myRestrictions?.muted ? (
                <p className="px-1 py-1 text-[13px] text-rose-300 max-[380px]:text-[12px]">You are muted in this room.</p>
              ) : (
                <p className="px-1 py-1 text-[13px] text-zinc-300 max-[380px]:text-[12px]">Sign in to chat</p>
              )}
            </div>
            {sendError ? <p className="mt-1.5 text-center text-[11px] text-rose-300">{sendError}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? scrollMessages
            ? "chat-container flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-transparent"
            : "chat-container flex w-full min-w-0 flex-none flex-col overflow-visible rounded-none border-0 bg-transparent lg:min-h-0"
          : "chat-container flex h-full min-h-0 flex-1 flex-col rounded-2xl border border-zinc-800 bg-zinc-950/80"
      }
    >
      <div className={`shrink-0 border-b border-zinc-800 ${compact ? "px-2.5 py-1.5" : "px-4 py-2.5"}`}>
        <p className={`${compact ? "text-[10px]" : "text-[11px]"} font-bold uppercase tracking-wider text-zinc-500`}>Live chat</p>
      </div>
      {blockedBanner}
      <div
        data-testid="live-chat-messages"
        className={`chat-messages space-y-2 overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch] touch-pan-y ${compact ? "p-2.5" : "p-4"} ${
          scrollMessages
            ? "min-h-0 flex-1 overflow-y-auto"
            : "flex-none overflow-visible lg:overflow-visible"
        }`}
      >
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center lg:min-h-0">
            <p className="text-sm font-semibold text-zinc-300">Chat will appear here</p>
            <p className="mt-1 text-xs text-zinc-500">Be the first to say hello.</p>
          </div>
        ) : (
          panelMessages.map((m, idx, arr) => {
            const isSystem = m.messageType === "system";
            const isPurchase = m.messageType === "purchase";
            const label = chatLabelForMessage(m);
            const labelClass = chatLabelClassForMessage(m, false, hostUserId, mod.moderators);
            const showAvatar = shouldShowChatAvatar(m);
            const isHost = isHostChatMessage(m, hostUserId);
            const isMod = isModeratorChatMessage(m, mod.moderators) && !isHost;
            return (
              <div
                key={m.id}
                className={`chat-msg-row group flex animate-[chat-rise_var(--live-duration-ui)_var(--live-ease)] items-start gap-2.5 leading-snug ${compact ? "text-sm" : "text-[15px]"}`}
                style={compact ? { opacity: 0.35 + (idx / Math.max(1, arr.length - 1)) * 0.65 } : undefined}
              >
                {showAvatar ? (
                  <LiveChatAvatar
                    username={m.senderUsername}
                    avatarUrl={m.senderAvatarUrl}
                    size={compact ? 28 : 30}
                    isHost={isHostChatMessage(m, hostUserId)}
                    isModerator={isModeratorChatMessage(m, mod.moderators)}
                    className="mt-0.5 shrink-0"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <span className={labelClass}>{label}</span>
                  {isHost ? (
                    <span className="ml-1.5 text-[10px] font-black uppercase tracking-wide text-amber-300/90">
                      HOST
                    </span>
                  ) : null}
                  {isMod ? (
                    <span className="ml-1.5 text-[10px] font-black uppercase tracking-wide text-violet-300/90">
                      MOD
                    </span>
                  ) : null}
                  <span className="text-zinc-600">: </span>
                  <span className={isSystem ? "text-zinc-200" : "text-zinc-300"}>
                    <MentionText body={m.body} mentions={m.mentions} />
                  </span>
                  {renderMessageActions(m)}
                  {m.messageType !== "chat" && !isSystem && !isPurchase ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-600">({m.messageType})</span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
      {mod.pinnedModeratorMessage ? (
        <PinnedChatBar
          message={mod.pinnedModeratorMessage}
          username={mod.pinnedModeratorUsername ?? "Moderator"}
          avatarUrl={mod.pinnedModeratorAvatarUrl}
          compact={compact}
        />
      ) : null}
      <div className={`chat-input shrink-0 border-t border-zinc-800 ${compact ? "bg-black/20 p-2.5 backdrop-blur-[var(--live-blur-md)]" : "p-3"}`}>
        {status === "loading" ? (
          <p className="text-center text-[11px] text-zinc-500">Loading session…</p>
        ) : status === "unauthenticated" ? (
          <p className="text-center text-[11px] text-zinc-500">Sign in to participate in chat.</p>
        ) : mod.myRestrictions?.muted || mod.roomBlocked ? (
          <p className="text-center text-[11px] text-rose-300">
            {mod.roomBlocked ? "You cannot participate in this room." : "You are muted in this room."}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <MentionComposer
                data-testid="live-chat-input"
                singleLine
                value={draft}
                onChange={(v) => {
                  setDraft(v);
                  setSendError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void send();
                }}
                placeholder="Send a message…"
                maxLength={2000}
                className={`h-9 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-black text-zinc-100 placeholder:text-zinc-600 outline-none ring-[#facc15]/0 transition-[box-shadow,border-color] focus:border-[#facc15]/50 focus:ring-2 focus:ring-[#facc15]/20 ${compact ? "px-4 py-1.5 text-sm" : "px-5 py-1.5 text-base"}`}
              />
              <button
                data-testid="live-chat-send"
                type="button"
                disabled={sending || !draft.trim()}
                onClick={() => void send()}
                className={`inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-[#facc15] font-black uppercase tracking-wide text-zinc-950 transition hover:bg-[#fde047] disabled:opacity-50 ${compact ? "px-5 text-xs" : "px-7 text-sm"}`}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
            {sendError ? <p className="mt-2 text-center text-[11px] font-medium text-rose-300">{sendError}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
