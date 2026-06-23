import { useCallback, useEffect, useRef, useState } from 'react';
import {
  announceLiveRoomViewerEvent,
  fetchLiveRoomChatMessages,
  sendLiveRoomChatMessage,
  type LiveRoomChatMessageRow,
} from '../api/liveRoomChatRepository';
import {
  JOIN_ANNOUNCE_COOLDOWN_MS,
  mergeChatMessagesById,
} from '../lib/liveRoomChatMessages';
import type { LiveRoomChatBroadcastMessage } from './useRealtimeRoomSubscription';
import type { ChatMessage, ChatMessageKind } from '../types';

const joinCooldownByRoom = new Map<string, number>();

function mapRow(m: LiveRoomChatMessageRow, hostUsername: string, hostUserId?: string): ChatMessage | null {
  const text = m.body?.trim();
  if (!text) return null;
  const host = hostUsername.trim().toLowerCase();
  const sender = m.senderUsername?.trim() || 'Guest';
  const messageType = (m.messageType ?? 'chat') as ChatMessageKind;
  if (messageType === 'bid') return null;
  const senderId = m.senderId?.trim() || undefined;
  return {
    id: m.id,
    user: sender,
    text,
    senderId,
    senderAvatarUrl: m.senderAvatarUrl ?? null,
    isHost: Boolean(hostUserId && senderId === hostUserId),
    messageType,
    mentions: m.mentions,
    createdAt: m.createdAt,
  };
}

function mapRows(rows: LiveRoomChatMessageRow[], hostUsername: string, hostUserId?: string): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const row of rows) {
    const mapped = mapRow(row, hostUsername, hostUserId);
    if (mapped) out.push(mapped);
  }
  return out;
}

function stripMatchingPendingMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return prev;
  return prev.filter((m) => {
    if (!m.id.startsWith('pending:')) return true;
    return !incoming.some(
      (row) =>
        row.senderId &&
        m.senderId === row.senderId &&
        m.text.trim() === row.text.trim(),
    );
  });
}

export function useLiveRoomChat(args: {
  roomId: string;
  hostUsername: string;
  hostUserId?: string;
  accessToken?: string;
  enabled: boolean;
  /** When true, rely on Supabase chat events; poll slowly as fallback. */
  realtimePrimary?: boolean;
  senderUserId?: string;
  senderUsername?: string;
  senderAvatarUrl?: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendLockRef = useRef(false);
  const reloadLockRef = useRef(false);

  useEffect(() => {
    setMessages([]);
  }, [args.roomId]);

  const appendRows = useCallback((rows: LiveRoomChatMessageRow[]) => {
    const mapped = mapRows(rows, args.hostUsername, args.hostUserId);
    if (mapped.length === 0) return;
    setMessages((prev) => mergeChatMessagesById(stripMatchingPendingMessages(prev, mapped), mapped));
  }, [args.hostUserId, args.hostUsername]);

  const reload = useCallback(async () => {
    if (reloadLockRef.current) return;
    reloadLockRef.current = true;
    try {
      const rows = await fetchLiveRoomChatMessages(args.roomId);
      const mapped = mapRows(rows, args.hostUsername, args.hostUserId);
      setMessages((prev) => mergeChatMessagesById(prev, mapped));
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      if (__DEV__) console.warn('[useLiveRoomChat] reload failed', msg);
    } finally {
      reloadLockRef.current = false;
    }
  }, [args.hostUserId, args.hostUsername, args.roomId]);

  const appendBroadcast = useCallback(
    (message: LiveRoomChatBroadcastMessage) => {
      if (!message.id) return;
      const row: LiveRoomChatMessageRow = {
        id: message.id,
        body: message.body,
        senderId: message.senderId,
        senderUsername: message.senderUsername ?? 'Guest',
        senderAvatarUrl: message.senderAvatarUrl ?? null,
        messageType: (message.messageType as LiveRoomChatMessageRow['messageType']) ?? 'chat',
        createdAt: message.createdAt ?? new Date().toISOString(),
        mentions: message.mentions,
      };
      appendRows([row]);
    },
    [appendRows],
  );

  useEffect(() => {
    if (!args.enabled) return undefined;
    void reload();
    const pollMs = args.realtimePrimary ? 30_000 : 4000;
    const id = setInterval(() => {
      void reload();
    }, pollMs);
    return () => clearInterval(id);
  }, [args.enabled, args.realtimePrimary, reload]);

  const announceJoin = useCallback(async (): Promise<boolean> => {
    if (!args.accessToken || !args.enabled) return false;
    const last = joinCooldownByRoom.get(args.roomId) ?? 0;
    if (Date.now() - last < JOIN_ANNOUNCE_COOLDOWN_MS) return false;
    try {
      const row = await announceLiveRoomViewerEvent({
        accessToken: args.accessToken,
        roomId: args.roomId,
        kind: 'join',
      });
      joinCooldownByRoom.set(args.roomId, Date.now());
      appendRows([row]);
      setError(null);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/not live yet|room has ended|409/i.test(msg)) return false;
      setError(msg);
      if (__DEV__) console.warn('[useLiveRoomChat] join announce failed', msg);
      throw e;
    }
  }, [appendRows, args.accessToken, args.enabled, args.roomId]);

  const announceLeave = useCallback(async (): Promise<void> => {
    if (!args.accessToken || !args.enabled) return;
    try {
      await announceLiveRoomViewerEvent({
        accessToken: args.accessToken,
        roomId: args.roomId,
        kind: 'leave',
      });
    } catch {
      /* best-effort when swiping away or closing the room */
    }
  }, [args.accessToken, args.enabled, args.roomId]);

  const announceShare = useCallback(async (): Promise<boolean> => {
    if (!args.accessToken) return false;
    try {
      const row = await announceLiveRoomViewerEvent({
        accessToken: args.accessToken,
        roomId: args.roomId,
        kind: 'share',
      });
      appendRows([row]);
      setError(null);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (__DEV__) console.warn('[useLiveRoomChat] share announce failed', msg);
      return false;
    }
  }, [appendRows, args.accessToken, args.roomId]);

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const body = text.trim();
      if (!body) return false;
      if (!args.accessToken) throw new Error('Sign in to chat.');
      if (sendLockRef.current) return false;

      sendLockRef.current = true;
      setSending(true);
      const clientMessageId = `cm-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const pendingId = `pending:${clientMessageId}`;
      const optimistic: ChatMessage = {
        id: pendingId,
        user: args.senderUsername?.trim() || 'You',
        text: body,
        senderId: args.senderUserId,
        senderAvatarUrl: args.senderAvatarUrl ?? null,
        isHost: Boolean(args.hostUserId && args.senderUserId && args.senderUserId === args.hostUserId),
        messageType: 'chat',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => mergeChatMessagesById(prev, [optimistic]));

      try {
        const row = await sendLiveRoomChatMessage({
          accessToken: args.accessToken,
          roomId: args.roomId,
          body,
          clientMessageId,
        });
        const next = mapRow(row, args.hostUsername, args.hostUserId);
        setMessages((prev) => {
          const stripped = stripMatchingPendingMessages(prev, next ? [next] : []);
          if (!next) return stripped.filter((m) => m.id !== pendingId);
          return mergeChatMessagesById(stripped, [next]);
        });
        setError(null);
        return true;
      } catch (e) {
        setMessages((prev) => prev.filter((m) => m.id !== pendingId));
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        sendLockRef.current = false;
        setSending(false);
      }
    },
    [
      args.accessToken,
      args.hostUserId,
      args.hostUsername,
      args.roomId,
      args.senderAvatarUrl,
      args.senderUserId,
      args.senderUsername,
    ],
  );

  return { messages, send, sending, error, reload, announceJoin, announceLeave, announceShare, appendBroadcast };
}
