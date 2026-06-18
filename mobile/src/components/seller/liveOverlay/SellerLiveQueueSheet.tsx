import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { logSellerQueue } from '../../../lib/logSellerQueue';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { LiveConsoleWarningBanner } from '../liveConsole/LiveConsoleWarningBanner';
import type { SanitizedLiveError } from '../liveConsole/liveConsoleErrors';
import { VaultQueueList } from '../liveConsole/VaultQueueList';
import { colors, radii, spacing } from '../../../theme';

export function SellerLiveQueueSheet({
  visible,
  onClose,
  loading,
  busy,
  items,
  roomType,
  roomEnded,
  queuedCount,
  consoleError,
  onRetry,
  onLaunch,
  onRemove,
  onReorder,
  onEditPricing,
  onAddItem,
}: {
  visible: boolean;
  onClose: () => void;
  loading: boolean;
  busy: boolean;
  items: LiveRoomItemRow[];
  roomType: 'auction' | 'sale' | 'break';
  roomEnded: boolean;
  queuedCount: number;
  consoleError: SanitizedLiveError | null;
  onRetry: () => void;
  onLaunch: (item: LiveRoomItemRow) => void;
  onRemove: (item: LiveRoomItemRow) => void;
  onReorder: (ordered: LiveRoomItemRow[]) => void;
  onEditPricing?: (item: LiveRoomItemRow) => void;
  onAddItem?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const drawerHeight = Math.round(windowHeight * 0.86);
  const queued = items.filter((i) => i.status === 'queued');

  const listHeader = (
    <View style={styles.listHeader}>
      {consoleError ? (
        <LiveConsoleWarningBanner error={consoleError} onRetry={onRetry} retrying={loading} />
      ) : null}
      {loading ? <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.lg }} /> : null}
    </View>
  );

  if (visible) {
    logSellerQueue('render_mode', {
      renderMode: loading ? 'sheet_loading' : queued.length > 0 ? 'sheet_list' : 'sheet_empty',
      queued: queued.length,
      total: items.length,
    });
    logSellerQueue('queue_length', { total: items.length, queued: queued.length, queuedCount });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss queue" />
        <View
          style={[
            styles.drawer,
            { height: drawerHeight, paddingBottom: insets.bottom + spacing.lg },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>Show queue</Text>
            <Text style={styles.count}>{queuedCount} waiting · no limit</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.listHost}>
            {!loading ? (
              <VaultQueueList
                scrollContainer
                items={items}
                roomType={roomType}
                roomEnded={roomEnded}
                busy={busy}
                onLaunch={onLaunch}
                onRemove={onRemove}
                onReorder={onReorder}
                onEditPricing={onEditPricing}
                listHeaderComponent={listHeader}
                contentContainerStyle={styles.listContent}
              />
            ) : (
              listHeader
            )}
          </View>
          {!roomEnded && onAddItem ? (
            <Pressable
              style={[styles.addFooter, busy && styles.addFooterOff]}
              onPress={onAddItem}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Add item to show queue"
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.gold} />
              <Text style={styles.addFooterTxt}>Add item</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  drawer: {
    flexDirection: 'column',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '900', color: colors.textPrimary },
  count: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  listHost: { flex: 1, minHeight: 0, paddingHorizontal: spacing.md },
  listHeader: { gap: spacing.sm },
  listContent: { paddingBottom: spacing.md },
  addFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  addFooterOff: { opacity: 0.55 },
  addFooterTxt: { fontSize: 14, fontWeight: '800', color: colors.gold },
});
