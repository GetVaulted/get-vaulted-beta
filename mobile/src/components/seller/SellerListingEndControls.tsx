import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  END_REASON_OPTIONS,
  cancelListingEndRequest,
  endSellerListing,
  submitListingEndRequest,
  type ListingEndReasonCategory,
  type WebListingEndRequest,
} from '../../api/listingEndRepository';
import { clearHomeFeedCache } from '../../lib/homeFeedCache';
import { colors, radii, spacing, typography } from '../../theme';

type Props = {
  listingId: string;
  title: string;
  buyingFormat: 'buy_now' | 'auction';
  listingStatus: string;
  bidCount: number;
  endRequest: WebListingEndRequest | null;
  onChanged: () => void;
};

const AUCTION_SAFETY_COPY =
  'For auctions with active bids, ending early requires review to protect bidders and marketplace trust.';

export function SellerListingEndControls({
  listingId,
  title,
  buyingFormat,
  listingStatus,
  bidCount,
  endRequest,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [reasonCategory, setReasonCategory] = useState<ListingEndReasonCategory>('listing_mistake');
  const [reasonText, setReasonText] = useState('');

  const isEnded = listingStatus === 'ended';
  const isAuction = buyingFormat === 'auction';
  const hasBids = bidCount > 0;
  const pendingRequest = endRequest?.status === 'pending';

  const afterAction = async () => {
    await clearHomeFeedCache();
    onChanged();
  };

  const confirmEndListing = () => {
    Alert.alert(
      'End this listing?',
      'Buyers will no longer be able to purchase this item.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End listing',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await endSellerListing(listingId);
                await afterAction();
              } catch (e) {
                Alert.alert('Could not end listing', e instanceof Error ? e.message : 'Try again.');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  const submitRequest = async () => {
    setBusy(true);
    try {
      await submitListingEndRequest(listingId, { reasonCategory, reasonText });
      setRequestOpen(false);
      setReasonText('');
      await afterAction();
    } catch (e) {
      Alert.alert('Request failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const cancelRequest = () => {
    if (!endRequest?.id) return;
    Alert.alert('Cancel end request?', 'Your auction will stay live while bidders participate.', [
      { text: 'Keep request', style: 'cancel' },
      {
        text: 'Cancel request',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await cancelListingEndRequest(listingId, endRequest.id);
              await afterAction();
            } catch (e) {
              Alert.alert('Could not cancel', e instanceof Error ? e.message : 'Try again.');
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  if (isEnded) {
    return (
      <View style={styles.panel}>
        <View style={styles.statusRow}>
          <Ionicons name="archive-outline" size={18} color={colors.textMuted} />
          <Text style={styles.statusEnded}>This listing has ended and is hidden from Marketplace and Home.</Text>
        </View>
      </View>
    );
  }

  if (endRequest?.status === 'denied') {
    return (
      <View style={styles.panel}>
        <Text style={styles.statusDenied}>End request denied — auction remains active.</Text>
        {endRequest.adminNote ? <Text style={styles.adminNote}>{endRequest.adminNote}</Text> : null}
        {isAuction && hasBids ? (
          <Pressable style={styles.secondaryBtn} onPress={() => setRequestOpen(true)} disabled={busy}>
            <Text style={styles.secondaryBtnTxt}>Submit a new request</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (pendingRequest) {
    return (
      <View style={styles.panel}>
        <View style={styles.pendingBanner}>
          <Ionicons name="time-outline" size={20} color={colors.gold} />
          <Text style={styles.pendingTitle}>End request pending review</Text>
        </View>
        <Text style={styles.pendingBody}>
          Your auction stays live until support reviews your request. Bidders are not disrupted.
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={cancelRequest} disabled={busy}>
          <Text style={styles.secondaryBtnTxt}>Cancel request</Text>
        </Pressable>
      </View>
    );
  }

  const canDirectEnd =
    (buyingFormat === 'buy_now' && listingStatus === 'active') ||
    (isAuction && listingStatus === 'auction_live' && !hasBids);

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Seller controls</Text>
      {isAuction && hasBids ? (
        <Text style={styles.safetyCopy}>{AUCTION_SAFETY_COPY}</Text>
      ) : null}

      {canDirectEnd ? (
        <Pressable style={styles.dangerBtn} onPress={confirmEndListing} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="stop-circle-outline" size={20} color="#fff" />
              <Text style={styles.dangerBtnTxt}>End listing</Text>
            </>
          )}
        </Pressable>
      ) : null}

      {isAuction && listingStatus === 'auction_live' && hasBids ? (
        <Pressable style={styles.dangerOutlineBtn} onPress={() => setRequestOpen(true)} disabled={busy}>
          <Ionicons name="shield-outline" size={18} color={colors.live} />
          <Text style={styles.dangerOutlineTxt}>Request to end auction</Text>
        </Pressable>
      ) : null}

      <Modal visible={requestOpen} animationType="slide" transparent onRequestClose={() => setRequestOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Request to end auction</Text>
            <Text style={styles.modalSub}>{AUCTION_SAFETY_COPY}</Text>
            <Text style={styles.fieldLbl}>Reason</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {END_REASON_OPTIONS.map((opt) => {
                const on = reasonCategory === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setReasonCategory(opt.id)}
                  >
                    <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.fieldLbl}>Explanation</Text>
            <TextInput
              style={styles.textArea}
              multiline
              placeholder={`Why do you need to end "${title}" early?`}
              placeholderTextColor={colors.textMuted}
              value={reasonText}
              onChangeText={setReasonText}
            />
            <Pressable
              style={[styles.dangerBtn, reasonText.trim().length < 10 && styles.btnOff]}
              onPress={() => void submitRequest()}
              disabled={busy || reasonText.trim().length < 10}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.dangerBtnTxt}>Submit for review</Text>
              )}
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => setRequestOpen(false)}>
              <Text style={styles.secondaryBtnTxt}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  panelTitle: { ...typography.subtitle, color: colors.textPrimary },
  safetyCopy: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#8B2E2E',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  dangerBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnOff: { opacity: 0.45 },
  dangerOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.5)',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  dangerOutlineTxt: { color: colors.live, fontWeight: '800', fontSize: 15 },
  secondaryBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  secondaryBtnTxt: { color: colors.textSecondary, fontWeight: '700' },
  statusRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  statusEnded: { ...typography.body, color: colors.textSecondary, flex: 1, lineHeight: 20 },
  statusDenied: { ...typography.body, color: colors.live, fontWeight: '600' },
  adminNote: { ...typography.caption, color: colors.textMuted },
  pendingBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pendingTitle: { ...typography.subtitle, color: colors.gold },
  pendingBody: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: '88%',
  },
  modalTitle: { ...typography.title, color: colors.textPrimary },
  modalSub: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  fieldLbl: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  chipScroll: { maxHeight: 44 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  chipOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  chipTxt: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  chipTxtOn: { color: colors.gold },
  textArea: {
    minHeight: 100,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
});
