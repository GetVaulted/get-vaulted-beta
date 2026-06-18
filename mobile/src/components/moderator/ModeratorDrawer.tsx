import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  applyLiveModerationAction,
  type LiveRoomModHistoryRow,
  type LiveRoomModQueueRow,
  type LiveRoomModerationSnapshot,
  type LiveRoomTipRow,
  type LiveRoomTipSummary,
  type LiveRoomViewerRow,
} from '../../api/trustRepository';
import { canPerformModeratorAction, formatModActionLabel, isLiveRoomHostUser } from '../../lib/liveModeratorPermissions';
import { colors, radii, spacing } from '../../theme';
import { ModeratorViewerActions } from './ModeratorViewerActions';

type TabId = 'queue' | 'viewers' | 'tips' | 'pinned' | 'announcements' | 'giveaway' | 'history';

const TABS: { id: TabId; label: string }[] = [
  { id: 'queue', label: 'Mod Queue' },
  { id: 'viewers', label: 'Viewers' },
  { id: 'tips', label: 'Tips' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'announcements', label: 'Announce' },
  { id: 'giveaway', label: 'Giveaway' },
  { id: 'history', label: 'History' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  liveRoomId: string;
  hostUserId?: string;
  accessToken?: string;
  moderation: LiveRoomModerationSnapshot;
  onRefresh: () => void;
};

export function ModeratorDrawer({
  visible,
  onClose,
  liveRoomId,
  hostUserId,
  accessToken,
  moderation,
  onRefresh,
}: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabId>('queue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinnedBody, setPinnedBody] = useState(moderation.pinnedModeratorMessage ?? '');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [giveawayTitle, setGiveawayTitle] = useState('');
  const [viewerAction, setViewerAction] = useState<LiveRoomViewerRow | null>(null);

  const can = (actionType: string) =>
    canPerformModeratorAction({
      actionType,
      isModerator: moderation.isModerator,
      isHost: moderation.isHost,
      moderatorLevel: moderation.moderatorLevel,
      allowedActions: moderation.allowedActions,
    });

  const runAction = async (args: {
    actionType: string;
    targetUserId?: string;
    metadata?: Record<string, unknown>;
  }) => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    const result = await applyLiveModerationAction({
      accessToken,
      roomId: liveRoomId,
      actionType: args.actionType,
      targetUserId: args.targetUserId,
      metadata: args.metadata,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Action failed.');
      return;
    }
    onRefresh();
  };

  const tabContent = useMemo(() => {
    switch (tab) {
      case 'queue':
        return (
          <ModQueueList rows={moderation.modQueue} emptyLabel="No open reports for this show." />
        );
      case 'viewers':
        return (
          <ViewersList
            rows={moderation.viewers}
            hostUserId={hostUserId}
            onSelect={(row) => setViewerAction(row)}
            emptyLabel="No recent chat activity yet."
          />
        );
      case 'tips':
        return (
          <TipsTab tips={moderation.tips} summary={moderation.tipSummary} />
        );
      case 'pinned':
        return (
          <PinnedTab
            value={pinnedBody}
            onChange={setPinnedBody}
            current={moderation.pinnedModeratorMessage}
            canPin={can('pin_message')}
            busy={busy}
            onSave={() => void runAction({ actionType: 'pin_message', metadata: { body: pinnedBody } })}
          />
        );
      case 'announcements':
        return (
          <AnnouncementTab
            value={announcementBody}
            onChange={setAnnouncementBody}
            canPost={can('post_announcement')}
            busy={busy}
            onPost={() => {
              void runAction({ actionType: 'post_announcement', metadata: { body: announcementBody } }).then(
                () => setAnnouncementBody(''),
              );
            }}
          />
        );
      case 'giveaway':
        return (
          <GiveawayTab
            value={giveawayTitle}
            onChange={setGiveawayTitle}
            canRun={can('run_giveaway')}
            busy={busy}
            onRun={() => {
              void runAction({ actionType: 'run_giveaway', metadata: { title: giveawayTitle } }).then(() =>
                setGiveawayTitle(''),
              );
            }}
          />
        );
      case 'history':
        return <HistoryList rows={moderation.modHistory} />;
      default:
        return null;
    }
  }, [
    tab,
    moderation.modQueue,
    moderation.viewers,
    moderation.tips,
    moderation.tipSummary,
    moderation.modHistory,
    moderation.pinnedModeratorMessage,
    pinnedBody,
    announcementBody,
    giveawayTitle,
    busy,
  ]);

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Moderator tools</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.subtitle}>
              Moderator{moderation.moderatorLevel ? ` · ${moderation.moderatorLevel}` : ''}
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRail}>
              {TABS.map((t) => (
                <Pressable
                  key={t.id}
                  style={[styles.tabChip, tab === t.id && styles.tabChipActive]}
                  onPress={() => setTab(t.id)}
                >
                  <Text style={[styles.tabChipText, tab === t.id && styles.tabChipTextActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
              {tabContent}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {viewerAction ? (
        <ModeratorViewerActions
          visible={Boolean(viewerAction)}
          onClose={() => setViewerAction(null)}
          liveRoomId={liveRoomId}
          accessToken={accessToken}
          isModerator={moderation.isModerator}
          isHost={moderation.isHost}
          moderatorLevel={moderation.moderatorLevel}
          allowedActions={moderation.allowedActions}
          userId={viewerAction.userId}
          username={viewerAction.username}
          hostUserId={hostUserId}
          onComplete={() => {
            setViewerAction(null);
            onRefresh();
          }}
        />
      ) : null}
    </>
  );
}

function ModQueueList({ rows, emptyLabel }: { rows: LiveRoomModQueueRow[]; emptyLabel: string }) {
  if (rows.length === 0) return <Text style={styles.empty}>{emptyLabel}</Text>;
  return (
    <>
      {rows.map((row) => (
        <View key={row.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {row.targetType} · {row.reason}
          </Text>
          <Text style={styles.cardMeta}>
            @{row.reporterUsername ?? 'unknown'} · {new Date(row.createdAt).toLocaleTimeString()}
          </Text>
          {row.description ? <Text style={styles.cardBody}>{row.description}</Text> : null}
        </View>
      ))}
    </>
  );
}

function ViewersList({
  rows,
  hostUserId,
  onSelect,
  emptyLabel,
}: {
  rows: LiveRoomViewerRow[];
  hostUserId?: string;
  onSelect: (row: LiveRoomViewerRow) => void;
  emptyLabel: string;
}) {
  if (rows.length === 0) return <Text style={styles.empty}>{emptyLabel}</Text>;
  return (
    <>
      {rows.map((row) => {
        const isHost = isLiveRoomHostUser(hostUserId, row.userId);
        return (
          <Pressable key={row.userId} style={styles.card} onPress={() => onSelect(row)}>
            <Text style={styles.cardTitle}>
              @{row.username}
              {isHost ? ' · HOST' : ''}
            </Text>
            <Text style={styles.cardMeta}>
              {row.messageCount} messages · {new Date(row.lastSeenAt).toLocaleTimeString()}
              {isHost ? ' · moderation unavailable' : ''}
            </Text>
          </Pressable>
        );
      })}
    </>
  );
}

function HistoryList({ rows }: { rows: LiveRoomModHistoryRow[] }) {
  if (rows.length === 0) return <Text style={styles.empty}>No moderation actions yet.</Text>;
  return (
    <>
      {rows.map((row) => (
        <View key={row.id} style={styles.card}>
          <Text style={styles.cardTitle}>{formatModActionLabel(row.actionType)}</Text>
          <Text style={styles.cardMeta}>
            @{row.moderatorUsername ?? 'mod'}
            {row.targetUsername ? ` → @${row.targetUsername}` : ''} ·{' '}
            {new Date(row.createdAt).toLocaleString()}
          </Text>
          {row.reason ? <Text style={styles.cardBody}>{row.reason}</Text> : null}
        </View>
      ))}
    </>
  );
}

function formatTipUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tipStatusLabel(status: LiveRoomTipRow['status']): string {
  if (status === 'paid') return 'Paid';
  if (status === 'pending') return 'Pending';
  return 'Failed';
}

function TipsTab({ tips, summary }: { tips: LiveRoomTipRow[]; summary: LiveRoomTipSummary | null }) {
  if (!summary) {
    return <Text style={styles.empty}>Tip tracking unavailable.</Text>;
  }

  const routingLabel = summary.tipsToModerator
    ? `Tips route to @${summary.tipModeratorUsername ?? 'moderator'}`
    : 'Tips route to host';

  return (
    <View style={styles.formBlock}>
      <View style={styles.tipSummaryCard}>
        <Text style={styles.tipSummaryTotal}>{formatTipUsd(summary.totalPaidUsd)}</Text>
        <Text style={styles.tipSummaryLbl}>Paid tips this show</Text>
        <Text style={styles.tipSummaryMeta}>
          {summary.paidCount} paid
          {summary.pendingCount > 0 ? ` · ${summary.pendingCount} pending` : ''}
          {summary.failedCount > 0 ? ` · ${summary.failedCount} failed` : ''}
        </Text>
        <Text style={styles.tipRouting}>{routingLabel}</Text>
      </View>

      {tips.length === 0 ? (
        <Text style={styles.empty}>No tips yet this show.</Text>
      ) : (
        tips.map((tip) => (
          <View key={tip.id} style={styles.card}>
            <View style={styles.tipRowTop}>
              <Text style={styles.cardTitle}>{formatTipUsd(tip.amountUsd)}</Text>
              <Text
                style={[
                  styles.tipStatus,
                  tip.status === 'paid' && styles.tipStatusPaid,
                  tip.status === 'pending' && styles.tipStatusPending,
                  tip.status === 'failed' && styles.tipStatusFailed,
                ]}
              >
                {tipStatusLabel(tip.status)}
              </Text>
            </View>
            <Text style={styles.cardMeta}>
              @{tip.senderUsername} → @{tip.recipientUsername} ·{' '}
              {new Date(tip.paidAt ?? tip.createdAt).toLocaleTimeString()}
            </Text>
            {tip.message.trim() ? <Text style={styles.cardBody}>{tip.message}</Text> : null}
          </View>
        ))
      )}
    </View>
  );
}

function PinnedTab({
  value,
  onChange,
  current,
  canPin,
  busy,
  onSave,
}: {
  value: string;
  onChange: (v: string) => void;
  current: string | null;
  canPin: boolean;
  busy: boolean;
  onSave: () => void;
}) {
  return (
    <View style={styles.formBlock}>
      {current ? (
        <View style={styles.card}>
          <Text style={styles.cardMeta}>Current pin</Text>
          <Text style={styles.cardBody}>{current}</Text>
        </View>
      ) : null}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Pinned message for the room"
        placeholderTextColor="rgba(255,255,255,0.35)"
        multiline
        editable={canPin && !busy}
      />
      <Pressable
        style={[styles.primaryBtn, (!canPin || busy || !value.trim()) && styles.primaryBtnDim]}
        disabled={!canPin || busy || !value.trim()}
        onPress={onSave}
      >
        {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.primaryBtnText}>Save pin</Text>}
      </Pressable>
      {!canPin ? <Text style={styles.hint}>Show-level moderators can pin messages.</Text> : null}
    </View>
  );
}

function AnnouncementTab({
  value,
  onChange,
  canPost,
  busy,
  onPost,
}: {
  value: string;
  onChange: (v: string) => void;
  canPost: boolean;
  busy: boolean;
  onPost: () => void;
}) {
  return (
    <View style={styles.formBlock}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Post a room announcement"
        placeholderTextColor="rgba(255,255,255,0.35)"
        multiline
        editable={canPost && !busy}
      />
      <Pressable
        style={[styles.primaryBtn, (!canPost || busy || !value.trim()) && styles.primaryBtnDim]}
        disabled={!canPost || busy || !value.trim()}
        onPress={onPost}
      >
        {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.primaryBtnText}>Post announcement</Text>}
      </Pressable>
      {!canPost ? <Text style={styles.hint}>Show-level moderators can post announcements.</Text> : null}
    </View>
  );
}

function GiveawayTab({
  value,
  onChange,
  canRun,
  busy,
  onRun,
}: {
  value: string;
  onChange: (v: string) => void;
  canRun: boolean;
  busy: boolean;
  onRun: () => void;
}) {
  return (
    <View style={styles.formBlock}>
      <Text style={styles.hint}>Log a giveaway run — winner selection hooks in separately.</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Giveaway title"
        placeholderTextColor="rgba(255,255,255,0.35)"
        editable={canRun && !busy}
      />
      <Pressable
        style={[styles.primaryBtn, (!canRun || busy || !value.trim()) && styles.primaryBtnDim]}
        disabled={!canRun || busy || !value.trim()}
        onPress={onRun}
      >
        {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.primaryBtnText}>Log giveaway</Text>}
      </Pressable>
      {!canRun ? <Text style={styles.hint}>Show-level moderators can run giveaways.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '82%',
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: spacing.lg,
    marginTop: 4,
    marginBottom: spacing.sm,
    textTransform: 'capitalize',
  },
  tabRail: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    maxHeight: 40,
  },
  tabChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    marginRight: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabChipActive: {
    backgroundColor: 'rgba(255,215,128,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,215,128,0.35)',
  },
  tabChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  tabChipTextActive: {
    color: colors.gold,
  },
  body: {
    paddingHorizontal: spacing.lg,
    minHeight: 220,
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  cardMeta: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  cardBody: {
    color: colors.textPrimary,
    fontSize: 13,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  empty: {
    color: colors.textSecondary,
    fontSize: 13,
    paddingVertical: spacing.lg,
  },
  formBlock: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  input: {
    minHeight: 88,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    color: colors.textPrimary,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    backgroundColor: colors.gold,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryBtnDim: {
    opacity: 0.45,
  },
  primaryBtnText: {
    color: '#111',
    fontWeight: '900',
    fontSize: 14,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  error: {
    color: '#f87171',
    fontSize: 12,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  tipSummaryCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,215,128,0.35)',
    backgroundColor: 'rgba(255,215,128,0.08)',
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  tipSummaryTotal: {
    color: colors.gold,
    fontSize: 28,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  tipSummaryLbl: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  tipSummaryMeta: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  tipRouting: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  tipRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  tipStatus: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  tipStatusPaid: {
    color: colors.gold,
  },
  tipStatusPending: {
    color: '#fbbf24',
  },
  tipStatusFailed: {
    color: '#f87171',
  },
});
