import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { LiveConsoleWarningBanner } from '../liveConsole/LiveConsoleWarningBanner';
import type { SanitizedLiveError } from '../liveConsole/liveConsoleErrors';
import { VaultQueueList } from '../liveConsole/VaultQueueList';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
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
}) {
  const insets = useSafeAreaInsets();

  const listHeader = (
    <View style={styles.listHeader}>
      {consoleError ? (
        <LiveConsoleWarningBanner error={consoleError} onRetry={onRetry} retrying={loading} />
      ) : null}
      {loading ? <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.lg }} /> : null}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss queue" />
        <View style={[styles.drawer, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>{SELLER_CONSOLE.lineup}</Text>
            <Text style={styles.count}>{queuedCount} waiting</Text>
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  drawer: {
    maxHeight: '78%',
    minHeight: '40%',
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
});
