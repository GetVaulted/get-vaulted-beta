import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LiveRoomLineupItemSnapshot } from '../../api/liveRoomBuyerRepository';
import { colors, radii, spacing } from '../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  lineupItems: LiveRoomLineupItemSnapshot[];
  activeItemId?: string | null;
  onSelectItem?: (itemId: string) => void;
};

export function LiveBuyerShopSheet({
  visible,
  onClose,
  lineupItems,
  activeItemId,
  onSelectItem,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss shop" />
        <View style={[styles.drawer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Shop this room</Text>
              <Text style={styles.subtitle}>
                {lineupItems.length} item{lineupItems.length === 1 ? '' : 's'} in host queue
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {lineupItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="bag-handle-outline" size={28} color={colors.gold} />
                <Text style={styles.emptyTitle}>Nothing in the lineup yet</Text>
                <Text style={styles.emptyHint}>Items the host adds to auction, buy-now, and spot boards will show here.</Text>
              </View>
            ) : (
              lineupItems.map((item) => {
                const selected = item.id === activeItemId || (item.isPinned && !activeItemId);
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.row, selected && styles.rowSelected]}
                    onPress={() => {
                      onSelectItem?.(item.id);
                      onClose();
                    }}
                  >
                    <View style={styles.thumbWrap}>
                      {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.thumb} contentFit="cover" />
                      ) : (
                        <View style={styles.thumbFallback}>
                          <Text style={styles.thumbFallbackTxt}>{item.displayTitle.slice(0, 1).toUpperCase()}</Text>
                        </View>
                      )}
                      {item.isLiveBidding ? (
                        <View style={styles.liveBadge}>
                          <Text style={styles.liveBadgeTxt}>Live</Text>
                        </View>
                      ) : item.isPinned ? (
                        <View style={styles.pinnedBadge}>
                          <Text style={styles.pinnedBadgeTxt}>On screen</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {item.displayTitle}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={2}>
                        {item.metaLine}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)' },
  drawer: {
    maxHeight: '78%',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: '#111114',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerCopy: { flex: 1, paddingRight: spacing.sm },
  title: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  subtitle: { marginTop: 2, fontSize: 12, color: colors.textSecondary },
  scroll: { maxHeight: 520 },
  scrollContent: { padding: spacing.md, gap: spacing.sm },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.md,
    padding: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  emptyHint: { fontSize: 12, lineHeight: 17, textAlign: 'center', color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.md,
    padding: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  rowSelected: { borderColor: 'rgba(212,175,55,0.45)', backgroundColor: 'rgba(212,175,55,0.08)' },
  thumbWrap: { width: 52, height: 52, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' },
  thumb: { width: '100%', height: '100%' },
  thumbFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbFallbackTxt: { fontSize: 16, fontWeight: '900', color: colors.textMuted },
  liveBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(16,185,129,0.85)',
    paddingVertical: 1,
  },
  liveBadgeTxt: { fontSize: 8, fontWeight: '900', textAlign: 'center', color: '#fff', textTransform: 'uppercase' },
  pinnedBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(212,175,55,0.85)',
    paddingVertical: 1,
  },
  pinnedBadgeTxt: { fontSize: 7, fontWeight: '900', textAlign: 'center', color: '#111', textTransform: 'uppercase' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  rowMeta: { marginTop: 2, fontSize: 11, lineHeight: 15, color: colors.textSecondary },
});
