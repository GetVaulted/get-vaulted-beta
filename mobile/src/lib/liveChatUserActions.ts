import { Alert } from 'react-native';
import { formatChatDisplayName } from './liveRoomChatMessages';

export function appendMentionToDraft(draft: string, username: string): string {
  const handle = username.replace(/^@/, '').trim();
  if (!handle) return draft;
  const prefix = draft.length > 0 && !/\s$/.test(draft) ? `${draft} ` : draft;
  return `${prefix}@${handle} `;
}

export function promptLiveChatUserAction(args: {
  username: string;
  userId?: string;
  onTag: (username: string) => void;
  onViewProfile?: (userId: string) => void;
}) {
  const name = formatChatDisplayName(args.username);
  const buttons: { text: string; onPress?: () => void; style?: 'cancel' }[] = [
    { text: 'Mention in chat', onPress: () => args.onTag(args.username) },
  ];
  if (args.userId && args.onViewProfile) {
    buttons.push({ text: 'View profile', onPress: () => args.onViewProfile!(args.userId!) });
  }
  buttons.push({ text: 'Cancel', style: 'cancel' });
  Alert.alert(name, undefined, buttons);
}
