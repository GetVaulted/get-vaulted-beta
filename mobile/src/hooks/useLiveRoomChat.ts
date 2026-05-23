import { useCallback, useEffect, useState } from 'react';
import {
  fetchLiveRoomChatMessages,
  sendLiveRoomChatMessage,
} from '../api/liveRoomChatRepository';
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

export function useLiveRoomChat(args: {
  roomId: string;
  hostUsername: string;
  accessToken?: string;
  enabled: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchLiveRoomChatMessages(args.roomId);
      setMessages(mapRows(rows, args.hostUsername));
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      if (__DEV__) console.warn('[useLiveRoomChat] reload failed', msg);
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
    async (text: string) => {
      const body = text.trim();
      if (!body) return;
      if (!args.accessToken) throw new Error('Sign in to chat.');
      setSending(true);
      try {
        const row = await sendLiveRoomChatMessage({
          accessToken: args.accessToken,
          roomId: args.roomId,
          body,
        });
        setMessages((prev) => {
          const next = mapRows([row], args.hostUsername)[0];
          if (!next) return prev;
          if (prev.some((m) => m.id === next.id)) return prev;
          return [...prev, next].slice(-80);
        });
        setError(null);
      } finally {
        setSending(false);
      }
    },
    [args.accessToken, args.hostUsername, args.roomId],
  );

  return { messages, send, sending, error, reload };
}
