import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { isLightSpotAccent, spotAccentColor, teamAbbrForVariant } from '../../../lib/liveBreakPresets';
import { isVariantSalesFormat } from '../../../lib/liveItemVariant';
import { colors, radii, spacing } from '../../../theme';
import { LiveRoomText } from '../../live/LiveRoomText';

type Props = {
  visible: boolean;
  onClose: () => void;
  item: LiveRoomItemRow | null;
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function SellerBreakSpotBoardSheet({ visible, onClose, item }: Props) {
  const insets = useSafeAreaInsets();
  if (!item || !isVariantSalesFormat(item.salesFormat)) return null;

  const isDivisionBreak = item.salesFormat === 'team_break';
  const variants = [...(item.variants ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const soldCount = variants.filter((v) => v.quantityRemaining <= 0 || v.status === 'sold_out').length;
  const openCount = variants.length - soldCount;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close team board" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <LinearGradient
            colors={['rgba(212,175,55,0.14)', 'rgba(10,10,14,0)']}
            style={styles.sheetGlow}
            pointerEvents="none"
          />
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <LiveRoomText style={styles.sheetTitle}>
                {isDivisionBreak ? 'Division board' : 'Team board'}
              </LiveRoomText>
              <LiveRoomText style={styles.itemTitle} numberOfLines={2}>
                {item.displayTitle?.trim() || item.title}
              </LiveRoomText>
              <LiveRoomText style={styles.spotsMeta}>
                {openCount} open · {soldCount} sold
              </LiveRoomText>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.75)" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.gridScroll}
            contentContainerStyle={[
              styles.gridContent,
              isDivisionBreak ? styles.gridContentDivision : styles.gridContentTeams,
            ]}
            showsVerticalScrollIndicator={false}
          >
            {variants.map((variant) => {
              const sold = variant.quantityRemaining <= 0 || variant.status === 'sold_out';
              const accent = spotAccentColor(variant.label ?? '', variant.color);
              const light = isLightSpotAccent(accent);
              const abbr = teamAbbrForVariant(variant.label);
              return (
                <View
                  key={variant.id}
                  style={[
                    styles.spotCell,
                    isDivisionBreak ? styles.spotCellDivision : styles.spotCellTeam,
                    sold && styles.spotCellSold,
                  ]}
                >
                  <LinearGradient
                    colors={sold ? ['#1a1a22', '#121218'] : [accent, `${accent}cc`]}
                    style={styles.spotGradient}
                  >
                    {variant.isHot && !sold ? (
                      <LiveRoomText style={styles.hotTag}>HOT</LiveRoomText>
                    ) : null}
                    <LiveRoomText style={[styles.spotAbbr, light && !sold && styles.spotAbbrDark]}>
                      {abbr}
                    </LiveRoomText>
                    <LiveRoomText
                      style={[styles.spotLabel, light && !sold && styles.spotLabelDark]}
                      numberOfLines={2}
                    >
                      {variant.label}
                    </LiveRoomText>
                    {sold ? (
                      <LiveRoomText style={styles.buyerTag} numberOfLines={1}>
                        {variant.buyerUsername ? `@${variant.buyerUsername.replace(/^@+/, '')}` : 'SOLD'}
                      </LiveRoomText>
                    ) : (
                      <LiveRoomText style={[styles.priceTag, light && styles.spotLabelDark]}>
                        {fmtMoney(variant.priceUsd)}
                      </LiveRoomText>
                    )}
                  </LinearGradient>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0a0a0e',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    overflow: 'hidden',
  },
  sheetGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headerCopy: { flex: 1 },
  sheetTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  itemTitle: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
  },
  spotsMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.48)',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  gridScroll: {
    marginTop: spacing.md,
    maxHeight: '72%',
  },
  gridContent: {
    paddingBottom: spacing.sm,
  },
  gridContentTeams: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridContentDivision: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  spotCell: {
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  spotCellTeam: {
    width: '23%',
    minWidth: 74,
    flexGrow: 1,
    aspectRatio: 0.92,
  },
  spotCellDivision: {
    width: '47%',
    minHeight: 92,
    flexGrow: 1,
  },
  spotCellSold: {
    opacity: 0.88,
  },
  spotGradient: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: 'flex-end',
    minHeight: 72,
  },
  hotTag: {
    position: 'absolute',
    top: 6,
    right: 6,
    fontSize: 8,
    fontWeight: '900',
    color: colors.gold,
    letterSpacing: 0.6,
  },
  spotAbbr: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
  },
  spotAbbrDark: {
    color: '#111',
  },
  spotLabel: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
  },
  spotLabelDark: {
    color: 'rgba(0,0,0,0.78)',
  },
  buyerTag: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '800',
    color: colors.gold,
  },
  priceTag: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
});
