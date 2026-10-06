import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MentionText } from '../../components/mentions/MentionText';
import type { ThreadMessage } from '../../types/messages';
import { colors, radii, spacing } from '../../theme';

export function MessageBubble({
  message,
  isMine,
  firstInGroup = true,
  lastInGroup = true,
  timeLabel = null,
  /** Show a small "Sent"/"Read" line under this bubble — only the most recent message you sent. */
  showStatus,
  onPressMentionUser,
}: {
  message: ThreadMessage;
  isMine: boolean;
  /** First bubble of a run from one person (more space above). */
  firstInGroup?: boolean;
  /** Last bubble of a run: square tail corner and the time underneath. */
  lastInGroup?: boolean;
  timeLabel?: string | null;
  showStatus?: boolean;
  onPressMentionUser?: (userId: string) => void;
}) {
  const system = message.kind === 'system';
  const [viewerOpen, setViewerOpen] = useState(false);
  const imageUrl = message.imageUrl?.trim() || null;

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
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs, { marginTop: firstInGroup ? 10 : 3 }]}>
      <View
        style={[
          styles.bubble,
          isMine ? styles.bubbleMine : styles.bubbleTheirs,
          lastInGroup && (isMine ? styles.tailMine : styles.tailTheirs),
          imageUrl && !message.body ? styles.bubbleImageOnly : null,
        ]}
      >
        {imageUrl ? (
          <Pressable onPress={() => setViewerOpen(true)} accessibilityRole="imagebutton" accessibilityLabel="Attached photo">
            <Image
              source={{ uri: imageUrl }}
              style={[styles.image, message.body ? styles.imageWithCaption : null]}
              contentFit="cover"
              transition={150}
              recyclingKey={imageUrl}
            />
          </Pressable>
        ) : null}
        {message.body ? (
          <MentionText
            body={message.body}
            mentions={message.mentions}
            style={[styles.body, isMine && styles.bodyMine]}
            mentionStyle={isMine ? styles.mentionOnMine : undefined}
            onPressUser={onPressMentionUser ? (userId) => { if (userId) onPressMentionUser(userId); } : undefined}
          />
        ) : null}
      </View>

      {timeLabel || (isMine && showStatus) ? (
        <View style={styles.statusRow} accessibilityLabel={isMine && showStatus ? (message.readAt ? 'Read' : 'Sent') : undefined}>
          {timeLabel ? <Text style={styles.statusTxt}>{timeLabel}</Text> : null}
          {isMine && showStatus ? (
            <>
              <Ionicons
                name={message.readAt ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={message.readAt ? colors.gold : '#6E6E6E'}
              />
              <Text style={[styles.statusTxt, message.readAt && styles.statusRead]}>
                {message.readAt ? 'Read' : 'Sent'}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}

      {imageUrl ? (
        <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
          <Pressable style={styles.viewerBackdrop} onPress={() => setViewerOpen(false)}>
            <Image source={{ uri: imageUrl }} style={styles.viewerImage} contentFit="contain" />
            <Pressable style={styles.viewerClose} onPress={() => setViewerOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.md },
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleMine: {
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  bubbleTheirs: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.12)',
  },
  tailMine: { borderBottomRightRadius: 6 },
  tailTheirs: { borderBottomLeftRadius: 6 },
  bubbleImageOnly: { padding: 4 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
    paddingHorizontal: 4,
  },
  statusTxt: {
    fontSize: 12,
    color: '#6E6E6E',
    fontVariant: ['tabular-nums'],
  },
  statusRead: { color: colors.gold },
  image: {
    width: 220,
    height: 220,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  imageWithCaption: { marginBottom: 8 },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '80%' },
  viewerClose: {
    position: 'absolute',
    top: 56,
    right: 20,
    padding: 8,
  },
  body: { fontSize: 15, lineHeight: 21, color: colors.textPrimary },
  bodyMine: { color: colors.background, fontWeight: '500' },
  mentionOnMine: { color: '#0e7490' },
  systemWrap: { alignItems: 'center', marginVertical: spacing.sm, paddingHorizontal: spacing.lg },
  system: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: '#0F0F0F',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.15)',
  },
  systemTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 15,
  },
});
