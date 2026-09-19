import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { liveBreakVariantIsSold, type LiveBreakVariantDraft } from '../../../lib/liveBreakPresets';
import { isVariantSalesFormat } from '../../../lib/liveItemVariant';
import { useKeyboardInset } from '../../wallet/walletSheetKeyboard';
import { colors, spacing } from '../../../theme';
import { BreakSpotSetupGrid, breakSpotsFromItemVariants } from './BreakSpotSetupGrid';

function variantsSyncKey(
  variants: LiveRoomItemRow['variants'] | undefined,
): string {
  if (!variants?.length) return '';
  return variants
    .map((v) => `${v.id}:${v.quantityRemaining}:${v.status}:${v.priceUsd}:${v.isHot ? 1 : 0}`)
    .join('|');
}

export function EditBreakSpotsModal({
  item,
  busy,
  onClose,
  onSave,
}: {
  item: LiveRoomItemRow | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (itemId: string, spots: LiveBreakVariantDraft[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const [spots, setSpots] = useState<LiveBreakVariantDraft[]>([]);

  const saleType = useMemo(() => {
    if (item?.salesFormat === 'team_break') return 'pyd' as const;
    if (item?.salesFormat === 'variant_selection') return 'pyt' as const;
    if (item?.salesFormat === 'player_selection') return 'pyp' as const;
    return null;
  }, [item?.salesFormat]);

  const variantKey = variantsSyncKey(item?.variants);

  useEffect(() => {
    if (!item) {
      setSpots([]);
      return;
    }
    setSpots(breakSpotsFromItemVariants(item) ?? []);
  }, [item?.id, variantKey]);

  const locked = item?.status === 'sold';
  const soldSpotIds = useMemo(() => {
    const ids = new Set<string>();
    for (const v of item?.variants ?? []) {
      if (liveBreakVariantIsSold(v)) ids.add(v.id);
    }
    for (const s of spots) {
      if (s.soldOut && s.id) ids.add(s.id);
    }
    return ids;
  }, [item?.variants, spots]);

  const save = () => {
    if (!item || !saleType) return;
    const openSpots = spots.filter((s) => !s.soldOut && !(s.id && soldSpotIds.has(s.id)));
    if (!openSpots.length) {
      Alert.alert('Edit break', 'No open spots to save.');
      return;
    }
    onSave(item.id, openSpots);
  };

  if (!item || !saleType || !isVariantSalesFormat(item.salesFormat)) return null;

  return (
    <Modal visible={item != null} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={() => Keyboard.dismiss()} accessibilityLabel="Dismiss keyboard" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) + keyboardInset }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.handle} />
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close spot editor">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>{saleType === 'pyt' ? 'Edit PYT spots' : 'Edit PYD spots'}</Text>
            <Text style={styles.sub} numberOfLines={2}>
              {item.displayTitle ?? item.title}
            </Text>
            <Text style={styles.hint}>
              Adjust prices on open teams or divisions and pin featured spots. Sold spots stay listed but cannot be
              edited.
            </Text>
            {locked ? (
              <Text style={styles.locked}>This break is sold — spot pricing is locked.</Text>
            ) : (
              <BreakSpotSetupGrid
                saleType={saleType}
                spots={spots}
                onChange={setSpots}
                disabled={busy}
                soldSpotIds={soldSpotIds}
              />
            )}
            {!locked ? (
              <Pressable style={[styles.primary, busy && styles.primaryOff]} onPress={save} disabled={busy}>
                <Text style={styles.primaryTxt}>{busy ? 'Saving…' : 'Save spots'}</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.secondary} onPress={onClose}>
                <Text style={styles.secondaryTxt}>Close</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    backgroundColor: '#0c0c0e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    maxHeight: Platform.OS === 'ios' ? '92%' : '94%',
  },
  sheetHeader: { alignItems: 'center', paddingTop: spacing.sm },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.xs,
  },
  closeBtn: { position: 'absolute', right: spacing.md, top: spacing.sm, padding: 4 },
  scrollContent: { padding: spacing.md, paddingTop: spacing.xs, gap: spacing.sm },
  title: { fontSize: 18, fontWeight: '900', color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textMuted },
  hint: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  locked: { fontSize: 13, color: '#fca5a5', lineHeight: 18 },
  primary: {
    marginTop: spacing.sm,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  primaryOff: { opacity: 0.55 },
  primaryTxt: { fontWeight: '900', color: '#0a0a0a', fontSize: 15 },
  secondary: {
    marginTop: spacing.sm,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  secondaryTxt: { fontWeight: '800', color: colors.textSecondary },
});
