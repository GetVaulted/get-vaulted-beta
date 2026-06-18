import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  assignLiveRoomModerator,
  revokeLiveRoomModerator,
  type LiveRoomModerationSnapshot,
  type LiveRoomViewerRow,
} from '../../api/trustRepository';
import { colors, radii, spacing } from '../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  liveRoomId: string;
  accessToken?: string;
  moderation: LiveRoomModerationSnapshot;
  hostUserId?: string;
  onRefresh: () => void;
};

export function HostModeratorAssignSheet({
  visible,
  onClose,
  liveRoomId,
  accessToken,
  moderation,
  hostUserId,
  onRefresh,
}: Props) {
  const insets = useSafeAreaInsets();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const moderatorIds = useMemo(
    () => new Set(moderation.moderators.map((m) => m.userId)),
    [moderation.moderators],
  );

  const assign = async (row: LiveRoomViewerRow) => {
    if (!accessToken || busyUserId) return;
    setBusyUserId(row.userId);
    setError(null);
    const result = await assignLiveRoomModerator({
      accessToken,
      roomId: liveRoomId,
      userId: row.userId,
    });
    setBusyUserId(null);
    if (!result.ok) {
      setError(result.error ?? 'Could not assign moderator.');
      return;
    }
    onRefresh();
  };

  const revoke = async (userId: string) => {
    if (!accessToken || busyUserId) return;
    setBusyUserId(userId);
    setError(null);
    const result = await revokeLiveRoomModerator({
      accessToken,
      roomId: liveRoomId,
      userId,
    });
    setBusyUserId(null);
    if (!result.ok) {
      setError(result.error ?? 'Could not remove moderator.');
      return;
    }
    onRefresh();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => undefined}>
          <View style={styles.handle} />
          <Text style={styles.title}>Assign moderator</Text>
          <Text style={styles.subtitle}>Pick a viewer from recent chat activity.</Text>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {moderation.viewers.length === 0 ? (
              <Text style={styles.empty}>No recent chat activity yet.</Text>
            ) : (
              moderation.viewers.map((row) => {
                if (hostUserId && row.userId === hostUserId) return null;
                const isMod = moderatorIds.has(row.userId);
                const busy = busyUserId === row.userId;
                return (
                  <View key={row.userId} style={styles.row}>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowName}>@{row.username}</Text>
                      <Text style={styles.rowMeta}>
                        {row.messageCount} message{row.messageCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                    {isMod ? (
                      <Pressable
                        style={styles.removeBtn}
                        disabled={busy}
                        onPress={() => void revoke(row.userId)}
                      >
                        {busy ? (
                          <ActivityIndicator color={colors.live} size="small" />
                        ) : (
                          <Text style={styles.removeTxt}>Remove</Text>
                        )}
                      </Pressable>
                    ) : (
                      <Pressable
                        style={styles.assignBtn}
                        disabled={busy}
                        onPress={() => void assign(row)}
                      >
                        {busy ? (
                          <ActivityIndicator color={colors.background} size="small" />
                        ) : (
                          <Text style={styles.assignTxt}>Make moderator</Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeTxt}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    maxHeight: '72%',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  list: {
    marginTop: spacing.md,
    maxHeight: 360,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 13,
    paddingVertical: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  rowMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  assignBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    minWidth: 112,
    alignItems: 'center',
  },
  assignTxt: { color: colors.background, fontWeight: '800', fontSize: 12 },
  removeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,59,48,0.45)',
    minWidth: 112,
    alignItems: 'center',
  },
  removeTxt: { color: colors.live, fontWeight: '800', fontSize: 12 },
  error: {
    marginTop: spacing.sm,
    color: colors.live,
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  closeTxt: { color: colors.gold, fontWeight: '800', fontSize: 15 },
});
