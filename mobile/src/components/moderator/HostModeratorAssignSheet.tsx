import { useEffect, useMemo, useState } from 'react';
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
import type { MentionSearchUser } from '../../api/mentionSearchRepository';
import {
  assignLiveRoomModerator,
  revokeLiveRoomModerator,
  type LiveRoomModerationSnapshot,
} from '../../api/trustRepository';
import { UsernameMentionPicker } from '../mentions/UsernameMentionPicker';
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
  const [search, setSearch] = useState('');

  const moderatorIds = useMemo(
    () => new Set(moderation.moderators.map((m) => m.userId)),
    [moderation.moderators],
  );

  useEffect(() => {
    if (!visible) {
      setSearch('');
      setError(null);
    }
  }, [visible]);

  const assignUser = async (user: MentionSearchUser) => {
    if (!accessToken || busyUserId) return;
    if (hostUserId && user.id === hostUserId) {
      setError('The show host cannot be assigned as a moderator.');
      return;
    }
    if (moderatorIds.has(user.id)) {
      setError(`@${user.username} is already a moderator.`);
      return;
    }
    setBusyUserId(user.id);
    setError(null);
    const result = await assignLiveRoomModerator({
      accessToken,
      roomId: liveRoomId,
      userId: user.id,
    });
    setBusyUserId(null);
    if (!result.ok) {
      setError(result.error ?? 'Could not assign moderator.');
      return;
    }
    setSearch('');
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
          <Text style={styles.subtitle}>
            Type @username like chat mentions, tap a match, and their mod tools will appear on their device.
          </Text>

          <View style={styles.searchBlock}>
            <UsernameMentionPicker
              value={search}
              onChangeText={setSearch}
              accessToken={accessToken}
              onSelectUser={(user) => void assignUser(user)}
              placeholder="@username"
              editable={!busyUserId}
            />
            {busyUserId ? (
              <View style={styles.assigningRow}>
                <ActivityIndicator color={colors.gold} size="small" />
                <Text style={styles.assigningTxt}>Assigning moderator…</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionLabel}>Current moderators</Text>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {moderation.moderators.length === 0 ? (
              <Text style={styles.empty}>No moderators assigned yet.</Text>
            ) : (
              moderation.moderators.map((mod) => {
                const busy = busyUserId === mod.userId;
                return (
                  <View key={mod.userId} style={styles.row}>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowName}>@{mod.username}</Text>
                      <Text style={styles.rowMeta}>
                        {mod.moderatorLevel ? `${mod.moderatorLevel} mod` : 'Moderator'} · shield tools active
                      </Text>
                    </View>
                    <Pressable
                      style={styles.removeBtn}
                      disabled={busy}
                      onPress={() => void revoke(mod.userId)}
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.live} size="small" />
                      ) : (
                        <Text style={styles.removeTxt}>Remove</Text>
                      )}
                    </Pressable>
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
    maxHeight: '78%',
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
  searchBlock: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  assigningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  assigningTxt: {
    color: colors.textMuted,
    fontSize: 12,
  },
  sectionLabel: {
    marginTop: spacing.lg,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  list: {
    marginTop: spacing.sm,
    maxHeight: 280,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 13,
    paddingVertical: spacing.md,
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
  removeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,59,48,0.45)',
    minWidth: 88,
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
