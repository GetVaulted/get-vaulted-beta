import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  applyLiveModerationAction,
  type LiveRoomModHistoryRow,
  type LiveRoomModPaymentFailureRow,
  type LiveRoomModQueueRow,
  type LiveRoomModRecentSaleRow,
  type LiveRoomModerationSnapshot,
  type LiveRoomTipRow,
  type LiveRoomTipSummary,
} from '../../api/trustRepository';
import { useModeratorRoomUserDirectory } from '../../hooks/useModeratorRoomUserDirectory';
import { useLiveRoomPresenceUsers } from '../../hooks/useLiveRoomPresenceUsers';
import {
  canPerformModeratorAction,
  formatModActionLabel,
  formatModeratorLevelLabel,
  isLiveRoomHostUser,
} from '../../lib/liveModeratorPermissions';
import { resolveModerationActor } from '../../lib/liveModeratorPermissions';
import { computePinExpiresIso } from '../../lib/pinnedMessageExpiry';
import type { ModeratorRoomUserRow } from '../../lib/mergeModeratorRoomUsers';
import { colors, radii, spacing } from '../../theme';
import { ModeratorViewerActions } from './ModeratorViewerActions';

const PIN_EXPIRES_OPTIONS = [
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hr' },
  { minutes: 120, label: '2 hr' },
  { minutes: 240, label: '4 hr' },
  { minutes: 24 * 60, label: '24 hr' },
] as const;

type TabId = 'tools' | 'users' | 'queue' | 'sales' | 'tips' | 'pinned' | 'announcements' | 'giveaway' | 'history';

const TABS: { id: TabId; label: string }[] = [
  { id: 'tools', label: 'Tools' },
  { id: 'users', label: 'Users' },
  { id: 'queue', label: 'Queue' },
  { id: 'sales', label: 'Sales' },
  { id: 'tips', label: 'Tips' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'announcements', label: 'Post' },
  { id: 'giveaway', label: 'Prize' },
  { id: 'history', label: 'Log' },
];

const SLOW_MODE_PRESETS = [0, 5, 10, 30] as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  liveRoomId: string;
  moderatorUserId?: string;
  accessToken?: string;
  moderation: LiveRoomModerationSnapshot & { pinnedMessageActive?: boolean };
  onRefresh: () => void;
  onModerationPatch?: (patch: Partial<LiveRoomModerationSnapshot>) => void;
};

export function ModeratorDrawer({
  visible,
  onClose,
  liveRoomId,
  moderatorUserId,
  accessToken,
  moderation,
  onRefresh,
  onModerationPatch,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.round(Math.min(windowHeight * 0.9, windowHeight - insets.top - 12));
  const sheetTop = Math.max(insets.top, windowHeight - sheetHeight);
  const [tab, setTab] = useState<TabId>('tools');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinnedBody, setPinnedBody] = useState(moderation.pinnedModeratorMessage ?? '');
  const [pinExpiresMinutes, setPinExpiresMinutes] = useState<number>(60);
  const [announcementBody, setAnnouncementBody] = useState('');
  const [giveawayTitle, setGiveawayTitle] = useState('');
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [selectedUser, setSelectedUser] = useState<ModeratorRoomUserRow | null>(null);

  const presenceUsers = useLiveRoomPresenceUsers(liveRoomId, visible);
  const roomUsers = useModeratorRoomUserDirectory({
    visible,
    presence: presenceUsers,
    viewers: moderation.viewers ?? [],
    moderators: moderation.moderators ?? [],
    modHistory: moderation.modHistory ?? [],
  });
  const moderatorIdSet = useMemo(
    () => new Set((moderation.moderators ?? []).map((m) => m.userId)),
    [moderation.moderators],
  );
  const modActor = useMemo(
    () =>
      resolveModerationActor({
        canModerate: moderation.canModerate,
        isHost: moderation.isHost,
        isModerator: moderation.isModerator,
        viewerRole: moderation.viewerRole,
        moderatorLevel: moderation.moderatorLevel,
        allowedActions: moderation.allowedActions,
        sellerId: moderation.sellerId,
        userId: moderatorUserId,
      }),
    [
      moderation.allowedActions,
      moderation.canModerate,
      moderation.isHost,
      moderation.isModerator,
      moderation.moderatorLevel,
      moderation.sellerId,
      moderation.viewerRole,
      moderatorUserId,
    ],
  );

  useEffect(() => {
    if (!visible) {
      setKeyboardInset(0);
      return undefined;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardInset(Math.max(0, e.endCoordinates.height - insets.bottom));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom, visible]);

  useEffect(() => {
    setPinnedBody(moderation.pinnedModeratorMessage ?? '');
  }, [moderation.pinnedModeratorMessage, visible]);

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (visible && (tab === 'tips' || tab === 'sales')) {
      onRefreshRef.current();
    }
  }, [visible, tab]);

  const can = (actionType: string) =>
    canPerformModeratorAction({
      actionType,
      isModerator: modActor.isModerator,
      isHost: modActor.isHost,
      canModerate: modActor.canModerate,
      moderatorLevel: modActor.moderatorLevel,
      allowedActions: modActor.allowedActions,
    });

  const resolveModeratorPinIdentity = useCallback(() => {
    const userId = moderatorUserId?.trim() ?? null;
    const fromList = userId
      ? (moderation.moderators ?? []).find((row) => row.userId === userId)?.username?.trim()
      : null;
    return {
      pinnedModeratorUserId: userId,
      pinnedModeratorUsername: fromList ?? moderation.pinnedModeratorUsername ?? null,
      pinnedModeratorAvatarUrl: moderation.pinnedModeratorAvatarUrl ?? null,
    };
  }, [
    moderation.moderators,
    moderation.pinnedModeratorAvatarUrl,
    moderation.pinnedModeratorUsername,
    moderatorUserId,
  ]);

  const runAction = async (args: {
    actionType: string;
    targetUserId?: string;
    metadata?: Record<string, unknown>;
  }) => {
    if (!accessToken) {
      setError('Sign in again to run moderation actions.');
      return;
    }
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

    if (args.actionType === 'pin_message') {
      const body = typeof args.metadata?.body === 'string' ? args.metadata.body.trim() : '';
      if (!body) {
        onModerationPatch?.({
          pinnedModeratorMessage: null,
          pinnedModeratorMessageAt: null,
          pinnedModeratorMessageExpiresAt: null,
          pinnedModeratorUserId: null,
          pinnedModeratorUsername: null,
          pinnedModeratorAvatarUrl: null,
        });
      } else {
        const pinnedAt = new Date();
        const expiresMinutes = Number(args.metadata?.expiresMinutes ?? 60);
        onModerationPatch?.({
          pinnedModeratorMessage: body,
          pinnedModeratorMessageAt: pinnedAt.toISOString(),
          pinnedModeratorMessageExpiresAt: computePinExpiresIso(pinnedAt, expiresMinutes),
          ...resolveModeratorPinIdentity(),
        });
      }
    }

    if (args.actionType === 'post_announcement') {
      const body = typeof args.metadata?.body === 'string' ? args.metadata.body.trim() : '';
      if (body) {
        const pinnedAt = new Date();
        onModerationPatch?.({
          pinnedModeratorMessage: body,
          pinnedModeratorMessageAt: pinnedAt.toISOString(),
          pinnedModeratorMessageExpiresAt: computePinExpiresIso(pinnedAt, 60),
          ...resolveModeratorPinIdentity(),
        });
      }
    }

    if (args.actionType === 'slow_mode') {
      const seconds = Math.round(Number(args.metadata?.seconds ?? 0));
      if (Number.isFinite(seconds) && seconds >= 0) {
        onModerationPatch?.({ slowModeSeconds: seconds });
      }
    }

    onRefresh();
  };

  const tabContent = useMemo(() => {
    switch (tab) {
      case 'tools':
        return (
          <RoomToolsTab
            slowModeSeconds={moderation.slowModeSeconds ?? 0}
            canSlowMode={can('slow_mode')}
            busy={busy}
            onSetSlowMode={(seconds) => void runAction({ actionType: 'slow_mode', metadata: { seconds } })}
            onOpenQueue={() => setTab('queue')}
            onOpenUsers={() => setTab('users')}
            onOpenAnnounce={() => setTab('announcements')}
            onOpenSales={() => setTab('sales')}
            queueCount={(moderation.modQueue ?? []).length}
            userCount={roomUsers.length}
            paymentAttentionCount={
              (moderation.paymentFailures ?? []).length +
              (moderation.recentSales ?? []).filter((r) => r.paymentTone === 'retry').length
            }
          />
        );
      case 'users':
        return (
          <UsersTab
            rows={roomUsers}
            hostUserId={moderation.sellerId}
            moderatorIds={moderatorIdSet}
            onSelect={(row) => {
              if (row.userId && !row.isGuest) setSelectedUser(row);
            }}
          />
        );
      case 'queue':
        return (
          <ModQueueList rows={moderation.modQueue ?? []} emptyLabel="No open reports for this show." />
        );
      case 'sales':
        return (
          <SalesTab
            paymentFailures={moderation.paymentFailures ?? []}
            recentSales={moderation.recentSales ?? []}
          />
        );
      case 'tips':
        return (
          <TipsTab tips={moderation.tips ?? []} summary={moderation.tipSummary} />
        );
      case 'pinned':
        return (
          <PinnedTab
            value={pinnedBody}
            onChange={setPinnedBody}
            current={moderation.pinnedMessageActive ? moderation.pinnedModeratorMessage : null}
            expiresAt={moderation.pinnedModeratorMessageExpiresAt ?? null}
            expiresMinutes={pinExpiresMinutes}
            onChangeExpiresMinutes={setPinExpiresMinutes}
            canPin={can('pin_message')}
            busy={busy}
            onSave={() =>
              void runAction({
                actionType: 'pin_message',
                metadata: { body: pinnedBody, expiresMinutes: pinExpiresMinutes },
              })
            }
            onUnpin={() => void runAction({ actionType: 'pin_message', metadata: { body: '' } })}
          />
        );
      case 'announcements':
        return (
          <AnnouncementTab
            value={announcementBody}
            onChange={setAnnouncementBody}
            current={moderation.pinnedMessageActive ? moderation.pinnedModeratorMessage : null}
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
        return <HistoryList rows={moderation.modHistory ?? []} />;
      default:
        return null;
    }
  }, [
    tab,
    accessToken,
    moderation.modQueue,
    moderation.viewers,
    moderation.sellerId,
    moderation.moderators,
    roomUsers,
    moderatorIdSet,
    moderation.slowModeSeconds,
    moderation.tips,
    moderation.tipSummary,
    moderation.recentSales,
    moderation.paymentFailures,
    moderation.modHistory,
    moderation.pinnedModeratorMessage,
    moderation.pinnedModeratorMessageExpiresAt,
    moderation.pinnedMessageActive,
    moderation.moderatorLevel,
    moderation.allowedActions,
    moderation.isModerator,
    moderation.isHost,
    pinnedBody,
    pinExpiresMinutes,
    announcementBody,
    giveawayTitle,
    busy,
  ]);

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={onClose}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdropFill} onPress={onClose} accessibilityRole="button" />
          <View
            style={[
              styles.sheet,
              {
                top: sheetTop,
                height: sheetHeight,
                paddingBottom: insets.bottom + spacing.md,
              },
            ]}
          >
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Moderator tools</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.subtitle}>
              {moderation.isHost
                ? 'Host · full mod tools'
                : formatModeratorLevelLabel(moderation.moderatorLevel)
                  ? `${formatModeratorLevelLabel(moderation.moderatorLevel)} tools`
                  : 'Moderator tools'}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabRail}
              contentContainerStyle={styles.tabRailContent}
              keyboardShouldPersistTaps="handled"
            >
              {TABS.map((t) => {
                const tipCount = t.id === 'tips' ? moderation.tipSummary?.paidCount ?? 0 : 0;
                const salesAttention =
                  t.id === 'sales'
                    ? (moderation.paymentFailures ?? []).length +
                      (moderation.recentSales ?? []).filter((r) => r.paymentTone === 'retry').length
                    : 0;
                const userCount = t.id === 'users' ? roomUsers.length : 0;
                const on = tab === t.id;
                return (
                  <Pressable
                    key={t.id}
                    style={[styles.tabChip, on && styles.tabChipActive]}
                    onPress={() => setTab(t.id)}
                  >
                    <Text style={[styles.tabChipText, on && styles.tabChipTextActive]}>{t.label}</Text>
                    {tipCount > 0 ? (
                      <View style={[styles.tabChipBadge, on && styles.tabChipBadgeActive]}>
                        <Text style={[styles.tabChipBadgeText, on && styles.tabChipBadgeTextActive]}>{tipCount}</Text>
                      </View>
                    ) : null}
                    {salesAttention > 0 ? (
                      <View style={[styles.tabChipBadge, styles.tabChipBadgeWarn, on && styles.tabChipBadgeActive]}>
                        <Text style={[styles.tabChipBadgeText, on && styles.tabChipBadgeTextActive]}>
                          {salesAttention}
                        </Text>
                      </View>
                    ) : null}
                    {userCount > 0 && t.id === 'users' ? (
                      <View style={[styles.tabChipBadge, on && styles.tabChipBadgeActive]}>
                        <Text style={[styles.tabChipBadgeText, on && styles.tabChipBadgeTextActive]}>{userCount}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <ScrollView
              style={styles.body}
              contentContainerStyle={[
                styles.bodyContent,
                keyboardInset > 0 ? { paddingBottom: keyboardInset + spacing.lg } : null,
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {tabContent}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {selectedUser?.userId ? (
        <ModeratorViewerActions
          visible={Boolean(selectedUser)}
          onClose={() => setSelectedUser(null)}
          liveRoomId={liveRoomId}
          accessToken={accessToken}
          isModerator={modActor.isModerator}
          isHost={modActor.isHost}
          canModerate={modActor.canModerate}
          moderatorLevel={modActor.moderatorLevel}
          allowedActions={modActor.allowedActions}
          userId={selectedUser.userId}
          username={selectedUser.username}
          hostUserId={modActor.showHostUserId}
          onComplete={() => {
            setSelectedUser(null);
            onRefresh();
          }}
        />
      ) : null}
    </>
  );
}

function RoomToolsTab({
  slowModeSeconds,
  canSlowMode,
  busy,
  onSetSlowMode,
  onOpenQueue,
  onOpenUsers,
  onOpenAnnounce,
  onOpenSales,
  queueCount,
  userCount,
  paymentAttentionCount,
}: {
  slowModeSeconds: number;
  canSlowMode: boolean;
  busy: boolean;
  onSetSlowMode: (seconds: number) => void;
  onOpenQueue: () => void;
  onOpenUsers: () => void;
  onOpenAnnounce: () => void;
  onOpenSales: () => void;
  queueCount: number;
  userCount: number;
  paymentAttentionCount: number;
}) {
  return (
    <View style={styles.formBlock}>
      <Text style={styles.sectionTitle}>Room controls</Text>
      <Text style={styles.hint}>Slow mode limits how fast buyers can send chat messages.</Text>
      <View style={styles.toolGrid}>
        {SLOW_MODE_PRESETS.map((seconds) => {
          const active = slowModeSeconds === seconds;
          const label = seconds === 0 ? 'Slow off' : `${seconds}s`;
          return (
            <Pressable
              key={seconds}
              style={[styles.toolChip, active && styles.toolChipActive, (!canSlowMode || busy) && styles.toolChipDim]}
              disabled={!canSlowMode || busy}
              onPress={() => onSetSlowMode(seconds)}
            >
              <Text style={[styles.toolChipText, active && styles.toolChipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {!canSlowMode ? (
        <Text style={styles.hint}>Show-level moderators can change slow mode.</Text>
      ) : null}

      <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>Quick actions</Text>
      <View style={styles.quickNavRow}>
        <Pressable style={styles.quickNavBtn} onPress={onOpenUsers}>
          <Text style={styles.quickNavBtnText}>
            Users{userCount > 0 ? ` (${userCount})` : ''}
          </Text>
        </Pressable>
        <Pressable style={styles.quickNavBtn} onPress={onOpenQueue}>
          <Text style={styles.quickNavBtnText}>
            Reports{queueCount > 0 ? ` (${queueCount})` : ''}
          </Text>
        </Pressable>
        <Pressable style={styles.quickNavBtn} onPress={onOpenSales}>
          <Text style={styles.quickNavBtnText}>
            Sales{paymentAttentionCount > 0 ? ` (${paymentAttentionCount})` : ''}
          </Text>
        </Pressable>
        <Pressable style={styles.quickNavBtn} onPress={onOpenAnnounce}>
          <Text style={styles.quickNavBtnText}>Post update</Text>
        </Pressable>
      </View>
      {paymentAttentionCount > 0 ? (
        <Text style={styles.paymentAttentionHint}>
          {paymentAttentionCount} payment{paymentAttentionCount === 1 ? '' : 's'} need attention — tell the host
          before the next lot.
        </Text>
      ) : null}

      <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>User moderation</Text>
      <Text style={styles.hint}>
        Long-press a chat message to copy, report, mute, timeout, kick, ban, remove kick/ban, block bidding, or delete.
      </Text>

      <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>More in this drawer</Text>
      <Text style={styles.hint}>
        Check Sales for Paid / Failed payments, tip totals, pin messages, post announcements, run giveaways, and review
        reports in the other tabs.
      </Text>
    </View>
  );
}

function UsersTab({
  rows,
  hostUserId,
  moderatorIds,
  onSelect,
}: {
  rows: ModeratorRoomUserRow[];
  hostUserId?: string;
  moderatorIds: Set<string>;
  onSelect: (row: ModeratorRoomUserRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <View style={styles.formBlock}>
        <Text style={styles.sectionTitle}>In this room</Text>
        <Text style={styles.empty}>No viewers detected yet. People appear here when they join the show or chat.</Text>
      </View>
    );
  }

  return (
    <View style={styles.formBlock}>
      <Text style={styles.sectionTitle}>In this room</Text>
      <Text style={styles.hint}>
        Live viewers from the room connection, plus recent chatters. Tap a member for moderation actions.
      </Text>
      {rows.map((row) => {
        const isHost = row.userId ? isLiveRoomHostUser(hostUserId, row.userId) : false;
        const isMod = row.userId ? moderatorIds.has(row.userId) : false;
        const subtitle = row.inRoom
          ? row.messageCount
            ? `In room · ${row.messageCount} chat message${row.messageCount === 1 ? '' : 's'}`
            : 'In room now'
          : row.messageCount
            ? `${row.messageCount} chat message${row.messageCount === 1 ? '' : 's'} recently`
            : 'Chatted recently';
        const canModerateRow = Boolean(row.userId && !row.isGuest && !isHost);

        return (
          <Pressable
            key={row.key}
            style={[styles.userRow, !canModerateRow && styles.userRowStatic]}
            disabled={!canModerateRow}
            onPress={() => onSelect(row)}
          >
            <View style={styles.userRowMain}>
              <Text style={styles.userRowName}>@{row.username}</Text>
              <Text style={styles.userRowMeta}>{subtitle}</Text>
            </View>
            <View style={styles.userRowBadges}>
              {isHost ? <Text style={styles.userBadgeHost}>HOST</Text> : null}
              {isMod ? <Text style={styles.userBadgeMod}>MOD</Text> : null}
              {row.isGuest ? <Text style={styles.userBadgeGuest}>GUEST</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
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

function saleToneStyle(tone: LiveRoomModRecentSaleRow['paymentTone']) {
  if (tone === 'paid') {
    return {
      wrap: { backgroundColor: 'rgba(16,185,129,0.18)', borderColor: 'rgba(16,185,129,0.4)' },
      text: { color: '#6ee7b7' },
    };
  }
  if (tone === 'retry') {
    return {
      wrap: { backgroundColor: 'rgba(248,113,113,0.18)', borderColor: 'rgba(248,113,113,0.45)' },
      text: { color: '#fecaca' },
    };
  }
  return {
    wrap: { backgroundColor: 'rgba(251,191,36,0.16)', borderColor: 'rgba(251,191,36,0.4)' },
    text: { color: '#fde68a' },
  };
}

function SalesTab({
  paymentFailures,
  recentSales,
}: {
  paymentFailures: LiveRoomModPaymentFailureRow[];
  recentSales: LiveRoomModRecentSaleRow[];
}) {
  return (
    <View style={styles.formBlock}>
      <Text style={styles.sectionTitle}>Payments</Text>
      <Text style={styles.hint}>
        Tell the host if something shows Failed / Needs retry. Cancel retry stays on the host Sales sheet.
      </Text>

      {paymentFailures.length > 0 ? (
        <View style={styles.salesAttentionBlock}>
          <Text style={styles.salesAttentionTitle}>Needs attention</Text>
          {paymentFailures.map((f) => (
            <View key={f.id} style={styles.card}>
              <Text style={styles.cardTitle}>
                @{f.buyerUsername ?? 'buyer'} · {formatTipUsd(f.amountUsd)}
              </Text>
              <Text style={styles.cardMeta}>
                {f.status === 'recovery_pending' ? 'Retrying payment' : 'Payment failed'}
                {f.itemTitle ? ` · ${f.itemTitle}` : ''}
              </Text>
              {f.failureReason ? <Text style={styles.cardBody}>{f.failureReason}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, { marginTop: spacing.xs }]}>Recent sales</Text>
      {recentSales.length === 0 ? (
        <Text style={styles.empty}>No payments on this show yet.</Text>
      ) : (
        recentSales.map((r) => {
          const badge = saleToneStyle(r.paymentTone);
          return (
            <View key={r.id} style={styles.saleRow}>
              <View style={styles.saleRowMain}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  @{r.buyerUsername} · {formatTipUsd(r.amountUsd)}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {r.itemTitle?.trim() || r.spotLabel?.trim() || r.kind.replace(/_/g, ' ')}
                  {' · '}
                  {new Date(r.occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
              <View style={[styles.saleBadge, badge.wrap]}>
                <Text style={[styles.saleBadgeTxt, badge.text]}>{r.statusLabel}</Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
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
      <Text style={styles.sectionTitle}>Show tips</Text>
      <Text style={styles.hint}>
        Tips are charged instantly from the viewer&apos;s Vault Wallet — separate from bids and buys. Only
        completed tips appear here.
      </Text>

      <View style={styles.tipSummaryCard}>
        <Text style={styles.tipSummaryTotal}>{formatTipUsd(summary.totalPaidUsd)}</Text>
        <Text style={styles.tipSummaryLbl}>Total received this show</Text>
        <Text style={styles.tipSummaryMeta}>
          {summary.paidCount} tip{summary.paidCount === 1 ? '' : 's'} this show
        </Text>
        <Text style={styles.tipRouting}>{routingLabel}</Text>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: spacing.xs }]}>Tip feed</Text>
      {tips.length === 0 ? (
        <Text style={styles.empty}>No tips yet — they will show up here as viewers send them.</Text>
      ) : (
        tips.map((tip) => (
          <View key={tip.id} style={styles.card}>
            <Text style={styles.cardTitle}>{formatTipUsd(tip.amountUsd)}</Text>
            <Text style={styles.cardMeta}>
              @{tip.senderUsername} → @{tip.recipientUsername} ·{' '}
              {new Date(tip.paidAt ?? tip.createdAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}
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
  expiresAt,
  expiresMinutes,
  onChangeExpiresMinutes,
  canPin,
  busy,
  onSave,
  onUnpin,
}: {
  value: string;
  onChange: (v: string) => void;
  current: string | null;
  expiresAt: string | null;
  expiresMinutes: number;
  onChangeExpiresMinutes: (v: number) => void;
  canPin: boolean;
  busy: boolean;
  onSave: () => void;
  onUnpin: () => void;
}) {
  return (
    <View style={styles.formBlock}>
      {current ? (
        <View style={styles.card}>
          <Text style={styles.cardMeta}>Current pin</Text>
          <Text style={styles.cardBody}>{current}</Text>
          {expiresAt ? (
            <Text style={styles.cardMeta}>
              Expires {new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </Text>
          ) : null}
          {canPin ? (
            <Pressable style={[styles.secondaryBtn, busy && styles.primaryBtnDim]} disabled={busy} onPress={onUnpin}>
              <Text style={styles.secondaryBtnText}>Remove pin</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Pinned message for the room"
        placeholderTextColor="rgba(255,255,255,0.35)"
        multiline
        editable={!busy}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.expiryRail}>
        {PIN_EXPIRES_OPTIONS.map((opt) => (
          <Pressable
            key={opt.minutes}
            style={[styles.expiryChip, expiresMinutes === opt.minutes && styles.expiryChipActive]}
            onPress={() => onChangeExpiresMinutes(opt.minutes)}
            disabled={!canPin || busy}
          >
            <Text style={[styles.expiryChipText, expiresMinutes === opt.minutes && styles.expiryChipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        style={[styles.primaryBtn, (!canPin || busy || !value.trim()) && styles.primaryBtnDim]}
        disabled={!canPin || busy || !value.trim()}
        onPress={onSave}
      >
        {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.primaryBtnText}>Save pin</Text>}
      </Pressable>
      {!canPin ? <Text style={styles.hint}>Only assigned show moderators can pin messages.</Text> : null}
    </View>
  );
}

function AnnouncementTab({
  value,
  onChange,
  current,
  canPost,
  busy,
  onPost,
}: {
  value: string;
  onChange: (v: string) => void;
  current: string | null;
  canPost: boolean;
  busy: boolean;
  onPost: () => void;
}) {
  return (
    <View style={styles.formBlock}>
      <Text style={styles.hint}>
        Posts to chat and pins the message above the composer for everyone in the room.
      </Text>
      {current ? (
        <View style={styles.card}>
          <Text style={styles.cardMeta}>Live announcement</Text>
          <Text style={styles.cardBody}>{current}</Text>
        </View>
      ) : null}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Post a room announcement"
        placeholderTextColor="rgba(255,255,255,0.35)"
        multiline
        editable={!busy}
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
      <Text style={styles.hint}>
        Record a giveaway for the moderation log. Hosts draw winners from the seller console.
      </Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Giveaway title"
        placeholderTextColor="rgba(255,255,255,0.35)"
        editable={!busy}
      />
      <Pressable
        style={[styles.primaryBtn, (!canRun || busy || !value.trim()) && styles.primaryBtnDim]}
        disabled={!canRun || busy || !value.trim()}
        onPress={onRun}
      >
        {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.primaryBtnText}>Record giveaway</Text>}
      </Pressable>
      {!canRun ? <Text style={styles.hint}>Show-level moderators can run giveaways.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingTop: spacing.sm,
    flexDirection: 'column',
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
  },
  tabRail: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: spacing.sm,
  },
  tabRailContent: {
    paddingHorizontal: spacing.lg,
    paddingRight: spacing.xl,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    marginRight: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabChipActive: {
    backgroundColor: 'rgba(255,215,128,0.22)',
    borderWidth: 1,
    borderColor: colors.gold,
  },
  tabChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  tabChipTextActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  tabChipBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tabChipBadgeActive: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  tabChipBadgeWarn: {
    backgroundColor: 'rgba(248,113,113,0.35)',
  },
  tabChipBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.textMuted,
  },
  tabChipBadgeTextActive: {
    color: colors.gold,
  },
  paymentAttentionHint: {
    marginTop: spacing.sm,
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  salesAttentionBlock: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  salesAttentionTitle: {
    color: '#fecaca',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  saleRowMain: {
    flex: 1,
    minWidth: 0,
  },
  saleBadge: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  saleBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
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
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  toolChip: {
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  toolChipActive: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(255,215,128,0.18)',
  },
  toolChipDim: {
    opacity: 0.45,
  },
  toolChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  toolChipTextActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  quickNavRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  quickNavBtn: {
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  quickNavBtnText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
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
  secondaryBtn: {
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  expiryRail: {
    marginBottom: spacing.sm,
  },
  expiryChip: {
    marginRight: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  expiryChipActive: {
    borderColor: 'rgba(255,215,128,0.45)',
    backgroundColor: 'rgba(255,215,128,0.12)',
  },
  expiryChipText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  expiryChipTextActive: {
    color: colors.gold,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    flexShrink: 1,
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
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  userRowStatic: {
    opacity: 0.85,
  },
  userRowMain: {
    flex: 1,
    minWidth: 0,
  },
  userRowName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  userRowMeta: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  userRowBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'flex-end',
  },
  userBadgeHost: {
    color: colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  userBadgeMod: {
    color: '#c4b5fd',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  userBadgeGuest: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
