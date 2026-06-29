import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
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
import {
  quickLiveLotFromItem,
  validateQuickLiveLot,
  type QuickLiveLotInput,
} from '../../../lib/liveAuctionPricing';
import { useKeyboardInset } from '../../wallet/walletSheetKeyboard';
import { colors, spacing } from '../../../theme';
import { QuickLiveLotFields } from './QuickLiveLotFields';

export function EditQueueItemPricingModal({
  item,
  busy,
  onClose,
  onSave,
}: {
  item: LiveRoomItemRow | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (itemId: string, values: import('../../../lib/liveAuctionPricing').QuickLiveLotValues) => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const [draft, setDraft] = useState<QuickLiveLotInput>(quickLiveLotFromItem({}));

  useEffect(() => {
    if (item) setDraft(quickLiveLotFromItem(item));
  }, [item?.id]);

  const save = () => {
    if (!item) return;
    const validated = validateQuickLiveLot({ ...draft, title: item.title });
    if (!validated.ok) {
      Alert.alert('Edit lot', validated.message);
      return;
    }
    onSave(item.id, validated.values);
  };

  const locked = item?.biddingOpen || item?.status === 'sold';

  return (
    <Modal visible={item != null} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={() => Keyboard.dismiss()} accessibilityLabel="Dismiss keyboard" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) + keyboardInset }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.handle} />
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close pricing editor">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>Edit lot</Text>
            <Text style={styles.sub} numberOfLines={2}>
              {item?.displayTitle ?? item?.title ?? 'Queue lot'}
            </Text>
            {!locked ? (
              <Text style={styles.hint}>
                Change sale type before bidding starts — switch Buy It Now to Auction to run a timed bid.
              </Text>
            ) : null}
            {locked ? (
              <Text style={styles.locked}>Bidding has started — pricing can no longer be changed.</Text>
            ) : (
              <QuickLiveLotFields value={draft} onChange={setDraft} disabled={busy} />
            )}
            {!locked ? (
              <Pressable style={[styles.primary, busy && styles.primaryOff]} onPress={save} disabled={busy}>
                <Text style={styles.primaryTxt}>{busy ? 'Saving…' : 'Save pricing'}</Text>
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
    maxHeight: Platform.OS === 'ios' ? '88%' : '92%',
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
  locked: { fontSize: 13, color: '#fca5a5', lineHeight: 18 },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  primary: {
    marginTop: spacing.sm,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.gold,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
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
  secondaryTxt: { fontWeight: '700', color: colors.textSecondary },
});
