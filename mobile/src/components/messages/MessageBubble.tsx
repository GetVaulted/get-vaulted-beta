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
  /** Show a small "Sent"/"Read" line under this bubble — only the most recent message you sent. */
  showStatus,
  onPressMentionUser,
}: {
  message: ThreadMessage;
  isMine: boolean;
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
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <View
        style={[
          styles.bubble,
          isMine ? styles.bubbleMine : styles.bubbleTheirs,
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

      {isMine && showStatus ? (
        <View style={styles.statusRow} accessibilityLabel={message.readAt ? 'Read' : 'Sent'}>
          <Ionicons
            name={message.readAt ? 'checkmark-done' : 'checkmark'}
            size={13}
            color={message.readAt ? colors.gold : 'rgba(255,255,255,0.4)'}
          />
          <Text style={styles.statusTxt}>{message.readAt ? 'Read' : 'Sent'}</Text>
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
  bubbleImageOnly: { padding: 4 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
    paddingRight: 4,
  },
  statusTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
  },
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
