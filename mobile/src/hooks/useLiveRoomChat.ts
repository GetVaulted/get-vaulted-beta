import { useCallback, useEffect, useRef, useState } from 'react';
import {
  announceLiveRoomViewerEvent,
  fetchLiveRoomChatMessages,
  sendLiveRoomChatMessage,
  type LiveRoomChatMessageRow,
} from '../api/liveRoomChatRepository';
import { dedupeChatMessagesById } from '../lib/liveRoomChatMessages';
import type { ChatMessage, ChatMessageKind } from '../types';

function mapRow(m: LiveRoomChatMessageRow, hostUsername: string): ChatMessage | null {
  const text = m.body?.trim();
  if (!text) return null;
  const host = hostUsername.trim().toLowerCase();
  const sender = m.senderUsername?.trim() || 'Guest';
  const messageType = (m.messageType ?? 'chat') as ChatMessageKind;
  if (messageType === 'bid') return null;
  return {
    id: m.id,
    user: sender,
    text,
    isHost: Boolean(host && sender.toLowerCase() === host),
    messageType,
  };
}

function mapRows(rows: LiveRoomChatMessageRow[], hostUsername: string): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const row of rows) {
    const mapped = mapRow(row, hostUsername);
    if (mapped) out.push(mapped);
  }
  return out;
}

function mergeChatMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  return dedupeChatMessagesById([...prev, ...incoming]).slice(-80);
}

export function useLiveRoomChat(args: {
  roomId: string;
  hostUsername: string;
  accessToken?: string;
  enabled: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendLockRef = useRef(false);
  const reloadLockRef = useRef(false);
  const joinAnnouncedRef = useRef(false);

  useEffect(() => {
    joinAnnouncedRef.current = false;
    setMessages([]);
  }, [args.roomId]);

  const appendRows = useCallback((rows: LiveRoomChatMessageRow[]) => {
    const mapped = mapRows(rows, args.hostUsername);
    if (mapped.length === 0) return;
    setMessages((prev) => mergeChatMessages(prev, mapped));
  }, [args.hostUsername]);

  const reload = useCallback(async () => {
    if (reloadLockRef.current) return;
    reloadLockRef.current = true;
    try {
      const rows = await fetchLiveRoomChatMessages(args.roomId);
      setMessages(mapRows(rows, args.hostUsername));
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      if (__DEV__) console.warn('[useLiveRoomChat] reload failed', msg);
    } finally {
      reloadLockRef.current = false;
    }
  }, [args.hostUsername, args.roomId]);

  useEffect(() => {
    if (!args.enabled) return undefined;
    void reload();
    const id = setInterval(() => {
      void reload();
    }, 4000);
    return () => clearInterval(id);
  }, [args.enabled, reload]);

  const announceJoin = useCallback(async (): Promise<boolean> => {
    if (!args.accessToken || !args.enabled) return false;
    if (joinAnnouncedRef.current) return false;
    joinAnnouncedRef.current = true;
    try {
      const row = await announceLiveRoomViewerEvent({
        accessToken: args.accessToken,
        roomId: args.roomId,
        kind: 'join',
      });
      appendRows([row]);
      setError(null);
      return true;
    } catch (e) {
      joinAnnouncedRef.current = false;
      const msg = e instanceof Error ? e.message : String(e);
      if (__DEV__) console.warn('[useLiveRoomChat] join announce failed', msg);
      return false;
    }
  }, [appendRows, args.accessToken, args.enabled, args.roomId]);

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

      try {
        const row = await sendLiveRoomChatMessage({
          accessToken: args.accessToken,
          roomId: args.roomId,
          body,
          clientMessageId,
        });
        const next = mapRow(row, args.hostUsername);
        if (next) {
          setMessages((prev) => mergeChatMessages(prev, [next]));
        }
        setError(null);
        return true;
      } finally {
        sendLockRef.current = false;
        setSending(false);
      }
    },
    [args.accessToken, args.hostUsername, args.roomId],
  );

  return { messages, send, sending, error, reload, announceJoin, announceShare };
}
