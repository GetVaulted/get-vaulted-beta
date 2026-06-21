import type { ChatMessage } from '../types';

export function findLatestUserChatSentAt(messages: ChatMessage[], userId: string | undefined): number | null {
  if (!userId?.trim()) return null;
  let latest = 0;
  for (const message of messages) {
    if (message.senderId !== userId) continue;
    if (message.messageType && message.messageType !== 'chat') continue;
    const sentAt = message.createdAt ? new Date(message.createdAt).getTime() : 0;
    if (sentAt > latest) latest = sentAt;
  }
  return latest > 0 ? latest : null;
}

export function computeSlowModeWaitMs(args: {
  slowModeSeconds: number;
  lastSentAtMs: number | null;
  nowMs: number;
  exempt: boolean;
}): number {
  if (args.exempt || args.slowModeSeconds <= 0 || !args.lastSentAtMs) return 0;
  const elapsed = args.nowMs - args.lastSentAtMs;
  return Math.max(0, args.slowModeSeconds * 1000 - elapsed);
}

export function parseSlowModeErrorMessage(message: string): number | null {
  const match = message.match(/Slow mode — wait (\d+)s/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function slowModeComposerPlaceholder(args: {
  slowModeSeconds: number;
  cooldownSeconds: number;
  chatBlocked: boolean;
  exempt: boolean;
  defaultPlaceholder?: string;
}): string {
  if (args.exempt || args.slowModeSeconds <= 0) {
    return args.defaultPlaceholder ?? 'Say something';
  }
  if (args.chatBlocked && args.cooldownSeconds > 0) {
    return `Chat in ${args.cooldownSeconds}s…`;
  }
  return `Say something (${args.slowModeSeconds}s slow mode)`;
}
