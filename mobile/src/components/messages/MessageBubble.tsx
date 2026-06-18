import { StyleSheet, Text, View } from 'react-native';
import { MentionText } from '../../components/mentions/MentionText';
import type { ThreadMessage } from '../../types/messages';
import { colors, radii, spacing } from '../../theme';

export function MessageBubble({
  message,
  isMine,
  onPressMentionUser,
}: {
  message: ThreadMessage;
  isMine: boolean;
  onPressMentionUser?: (userId: string) => void;
}) {
  const system = message.kind === 'system';

  if (system) {
    return (
      <View style={styles.systemWrap}>
        <View style={styles.system}>
          <Text style={styles.systemTxt}>{message.body}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <MentionText
          body={message.body}
          mentions={message.mentions}
          style={[styles.body, isMine && styles.bodyMine]}
          mentionStyle={isMine ? styles.mentionOnMine : undefined}
          onPressUser={onPressMentionUser ? (userId) => { if (userId) onPressMentionUser(userId); } : undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 6, paddingHorizontal: spacing.md },
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
  },
  bubbleMine: {
    backgroundColor: 'rgba(212,175,55,0.92)',
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    borderBottomLeftRadius: 4,
  },
  body: { fontSize: 14, lineHeight: 19, color: colors.textPrimary, fontWeight: '500' },
  bodyMine: { color: '#0a0a0a', fontWeight: '600' },
  mentionOnMine: { color: '#0e7490' },
  systemWrap: { alignItems: 'center', marginVertical: spacing.sm, paddingHorizontal: spacing.lg },
  system: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.25)',
  },
  systemTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 15,
  },
});
