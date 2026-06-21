import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  computeSlowModeWaitMs,
  findLatestUserChatSentAt,
  parseSlowModeErrorMessage,
} from '../lib/liveChatSlowMode';
import type { ChatMessage } from '../types';

export function useLiveChatSlowMode(args: {
  slowModeSeconds: number;
  exempt: boolean;
  userId?: string;
  messages: ChatMessage[];
  enabled?: boolean;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [manualLastSentAtMs, setManualLastSentAtMs] = useState<number | null>(null);

  const messageLastSentAtMs = useMemo(
    () => findLatestUserChatSentAt(args.messages, args.userId),
    [args.messages, args.userId],
  );

  const lastSentAtMs = useMemo(() => {
    if (manualLastSentAtMs && messageLastSentAtMs) {
      return Math.max(manualLastSentAtMs, messageLastSentAtMs);
    }
    return manualLastSentAtMs ?? messageLastSentAtMs;
  }, [manualLastSentAtMs, messageLastSentAtMs]);

  const waitMs = useMemo(
    () =>
      computeSlowModeWaitMs({
        slowModeSeconds: args.slowModeSeconds,
        lastSentAtMs,
        nowMs,
        exempt: args.exempt,
      }),
    [args.exempt, args.slowModeSeconds, lastSentAtMs, nowMs],
  );

  const cooldownSeconds = waitMs > 0 ? Math.ceil(waitMs / 1000) : 0;
  const chatBlocked = Boolean(args.enabled !== false && !args.exempt && waitMs > 0);
  const slowModeActive = Boolean(args.enabled !== false && !args.exempt && args.slowModeSeconds > 0);

  useEffect(() => {
    if (!slowModeActive || chatBlocked) {
      const id = setInterval(() => setNowMs(Date.now()), chatBlocked ? 250 : 1000);
      return () => clearInterval(id);
    }
    return undefined;
  }, [chatBlocked, slowModeActive]);

  const recordSuccessfulSend = useCallback(() => {
    setManualLastSentAtMs(Date.now());
    setNowMs(Date.now());
  }, []);

  const syncFromSendError = useCallback(
    (message: string) => {
      const waitSeconds = parseSlowModeErrorMessage(message);
      if (!waitSeconds || args.slowModeSeconds <= 0) return;
      const sentAt = Date.now() - Math.max(0, args.slowModeSeconds - waitSeconds) * 1000;
      setManualLastSentAtMs(sentAt);
      setNowMs(Date.now());
    },
    [args.slowModeSeconds],
  );

  return {
    slowModeActive,
    chatBlocked,
    cooldownSeconds,
    waitMs,
    recordSuccessfulSend,
    syncFromSendError,
  };
}
