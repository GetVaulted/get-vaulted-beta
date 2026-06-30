import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  isLightSpotAccent,
  spotAccentColor,
  teamAbbrForVariant,
  type LiveBreakVariantDraft,
} from '../../../lib/liveBreakPresets';
import { formatUsdInput, parseUsdInput } from '../../../lib/liveAuctionPricing';
import { colors, radii, spacing } from '../../../theme';

type Props = {
  saleType: 'pyt' | 'pyd';
  spots: LiveBreakVariantDraft[];
  onChange: (next: LiveBreakVariantDraft[]) => void;
  disabled?: boolean;
  /** Hide sold spots when editing a live/queued item. */
  hideSold?: boolean;
  soldSpotIds?: Set<string>;
};

function fmtMoney(n: number) {
  return `$${formatUsdInput(n)}`;
}

export function breakSpotsFromItemVariants(
  item: {
    salesFormat?: string;
    variants?: Array<{
      id: string;
      label: string;
      priceUsd: number;
      quantityRemaining: number;
      isHot: boolean;
      status: string;
      color?: string | null;
      sortOrder?: number;
    }>;
  },
): LiveBreakVariantDraft[] | null {
  if (item.salesFormat !== 'variant_selection' && item.salesFormat !== 'team_break') return null;
  if (!item.variants?.length) return null;
  return item.variants
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((v, sortOrder) => ({
      id: v.id,
      label: v.label,
      priceUsd: v.priceUsd,
      quantityInitial: 1,
      sortOrder,
      color: v.color ?? '',
      isHot: v.isHot,
    }));
}

export function BreakSpotSetupGrid({
  saleType,
  spots,
  onChange,
  disabled = false,
  hideSold = false,
  soldSpotIds,
}: Props) {
  const isDivision = saleType === 'pyd';
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [priceDraft, setPriceDraft] = useState('');

  const visibleSpots = useMemo(() => {
    if (!hideSold) return spots.map((spot, index) => ({ spot, index }));
    return spots
      .map((spot, index) => ({ spot, index }))
      .filter(({ spot }) => !spot.id || !soldSpotIds?.has(spot.id));
  }, [hideSold, soldSpotIds, spots]);

  const pinnedCount = spots.filter((s) => s.isHot).length;

  const applyBaseToAll = (raw: string) => {
    const parsed = parseUsdInput(raw);
    if (parsed == null) return;
    onChange(spots.map((s) => ({ ...s, priceUsd: parsed })));
  };

  const updateSpot = (index: number, patch: Partial<LiveBreakVariantDraft>) => {
    onChange(spots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const togglePin = (index: number) => {
    updateSpot(index, { isHot: !spots[index]?.isHot });
  };

  const openEditor = (index: number) => {
    if (disabled) return;
    setSelectedIndex(index);
    setPriceDraft(formatUsdInput(spots[index]?.priceUsd ?? 0));
  };

  const commitPrice = () => {
    if (selectedIndex == null) return;
    const parsed = parseUsdInput(priceDraft);
    if (parsed == null) return;
    updateSpot(selectedIndex, { priceUsd: parsed });
    setSelectedIndex(null);
    setPriceDraft('');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>
          {isDivision ? '8 divisions' : '32 teams'} · {pinnedCount} pinned
        </Text>
        <Text style={styles.toolbarHint}>Tap a spot to set price · Pin to feature for buyers</Text>
      </View>

      <ScrollView
        style={styles.gridScroll}
        contentContainerStyle={[styles.grid, isDivision && styles.gridDivision]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {visibleSpots.map(({ spot, index }) => {
          const accent = spotAccentColor(spot.label, spot.color, isDivision);
          const lightText = isLightSpotAccent(accent);
          const abbr = !isDivision ? teamAbbrForVariant(spot.label, spot.color) : null;
          const selected = selectedIndex === index;
          return (
            <View key={`${spot.label}-${index}`} style={[styles.cellWrap, isDivision ? styles.cellDivision : styles.cellTeam]}>
              <Pressable
                style={[styles.cell, selected && styles.cellSelected]}
                onPress={() => openEditor(index)}
                disabled={disabled}
              >
                <LinearGradient colors={[accent, `${accent}CC`]} style={styles.cellGradient}>
                  {abbr ? (
                    <Text style={[styles.abbr, lightText && styles.textDark]}>{abbr}</Text>
                  ) : (
                    <Text style={[styles.divisionLabel, lightText && styles.textDark]} numberOfLines={2}>
                      {spot.label}
                    </Text>
                  )}
                  <Text style={[styles.price, lightText && styles.textDarkMuted]}>{fmtMoney(spot.priceUsd)}</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                style={[styles.pinBtn, spot.isHot && styles.pinBtnActive]}
                onPress={() => togglePin(index)}
                disabled={disabled}
                accessibilityLabel={spot.isHot ? 'Unpin spot' : 'Pin spot for buyers'}
              >
                <Text style={[styles.pinBtnText, spot.isHot && styles.pinBtnTextActive]}>
                  {spot.isHot ? 'Pinned' : 'Pin'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {selectedIndex != null ? (
        <View style={styles.editor}>
          <Text style={styles.editorLabel} numberOfLines={1}>
            Price · {spots[selectedIndex]?.label}
          </Text>
          <View style={styles.editorRow}>
            <TextInput
              value={priceDraft}
              onChangeText={setPriceDraft}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              style={styles.editorInput}
              editable={!disabled}
            />
            <Pressable style={styles.editorSave} onPress={commitPrice} disabled={disabled}>
              <Text style={styles.editorSaveTxt}>Set</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Pressable
        style={[styles.applyAll, disabled && styles.applyAllOff]}
        onPress={() => applyBaseToAll(priceDraft || formatUsdInput(spots[0]?.priceUsd ?? 0))}
        disabled={disabled}
      >
        <Text style={styles.applyAllTxt}>Apply first spot price to all</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  toolbar: { gap: 2 },
  toolbarTitle: { fontSize: 12, fontWeight: '800', color: colors.textPrimary },
  toolbarHint: { fontSize: 11, color: colors.textMuted, lineHeight: 15 },
  gridScroll: { maxHeight: 280 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: spacing.xs },
  gridDivision: { gap: 10 },
  cellWrap: { position: 'relative' },
  cellTeam: { width: '23%', minWidth: 74, flexGrow: 1 },
  cellDivision: { width: '47%', minWidth: 140, flexGrow: 1 },
  cell: { borderRadius: radii.md, overflow: 'hidden' },
  cellSelected: {
    borderWidth: 2,
    borderColor: colors.gold,
  },
  cellGradient: {
    minHeight: 68,
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: 'flex-end',
  },
  abbr: { fontSize: 14, fontWeight: '900', color: '#fff' },
  divisionLabel: { fontSize: 12, fontWeight: '900', color: '#fff', lineHeight: 15 },
  price: { marginTop: 4, fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.78)' },
  textDark: { color: '#111' },
  textDarkMuted: { color: 'rgba(17,17,17,0.72)' },
  pinBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 36,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pinBtnActive: {
    backgroundColor: 'rgba(212,175,55,0.22)',
    borderColor: 'rgba(212,175,55,0.45)',
  },
  pinBtnText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.72)',
  },
  pinBtnTextActive: {
    color: colors.gold,
  },
  editor: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: spacing.sm,
    gap: 8,
  },
  editorLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  editorRow: { flexDirection: 'row', gap: 8 },
  editorInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  editorSave: {
    borderRadius: radii.sm,
    backgroundColor: colors.gold,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  editorSaveTxt: { fontWeight: '900', color: '#111', fontSize: 13 },
  applyAll: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  applyAllOff: { opacity: 0.45 },
  applyAllTxt: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
});
