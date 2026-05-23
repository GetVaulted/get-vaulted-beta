import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchLiveRoomChatMessages,
  sendLiveRoomChatMessage,
} from '../api/liveRoomChatRepository';
import { dedupeChatMessagesById } from '../lib/liveRoomChatMessages';
import type { ChatMessage } from '../types';

function mapRows(rows: Awaited<ReturnType<typeof fetchLiveRoomChatMessages>>, hostUsername: string): ChatMessage[] {
  const host = hostUsername.trim().toLowerCase();
  return rows
    .filter((m) => m.body?.trim())
    .map((m) => ({
      id: m.id,
      user: m.senderUsername?.trim() || 'Guest',
      text: m.body.trim(),
      isHost: Boolean(host && m.senderUsername?.trim().toLowerCase() === host),
    }));
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
        const next = mapRows([row], args.hostUsername)[0];
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

  return { messages, send, sending, error, reload };
}
