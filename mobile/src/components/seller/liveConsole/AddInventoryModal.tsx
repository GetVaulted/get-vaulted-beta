import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { uploadListingImageViaWeb } from '../../../api/webListingsRepository';
import {
  breakSpotCountForSaleType,
  emptyQuickLiveLotInput,
  isBreakLotSaleType,
  isPickBreakLotSaleType,
  parseUsdInput,
  validateQuickLiveLot,
  type LiveLotSaleType,
  type QuickLiveLotInput,
  type QuickLiveLotValues,
} from '../../../lib/liveAuctionPricing';
import { buildPydVariants, buildPytVariants, type LiveBreakVariantDraft } from '../../../lib/liveBreakPresets';
import { useKeyboardInset } from '../../wallet/walletSheetKeyboard';
import { colors, radii, spacing } from '../../../theme';
import { BreakSpotSetupGrid } from './BreakSpotSetupGrid';

const THUMBNAIL_MAX_BYTES = 20 * 1024 * 1024;

export type QuickLiveLotSubmitPayload = QuickLiveLotValues & { imageUrl: string };

export type QuickLiveLotSubmitOptions = {
  addAnother?: boolean;
};

export function AddInventoryModal({
  visible,
  accessToken,
  busy,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  accessToken: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (payload: QuickLiveLotSubmitPayload, options?: QuickLiveLotSubmitOptions) => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const [draft, setDraft] = useState<QuickLiveLotInput>(emptyQuickLiveLotInput());
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [spotDrafts, setSpotDrafts] = useState<LiveBreakVariantDraft[]>([]);

  const resetDraft = () => {
    setDraft(emptyQuickLiveLotInput());
    setSpotDrafts([]);
    setImageUri(null);
    setImageUrl(null);
    setImageUploading(false);
    setImageError(null);
  };

  useEffect(() => {
    if (visible) resetDraft();
  }, [visible]);

  useEffect(() => {
    if (!isPickBreakLotSaleType(draft.saleType)) {
      setSpotDrafts([]);
      return;
    }
    const basePrice = parseUsdInput(draft.price);
    const expected = breakSpotCountForSaleType(draft.saleType);
    setSpotDrafts((prev) => {
      if (prev.length === expected) return prev;
      if (basePrice == null) return [];
      return draft.saleType === 'pyt' ? buildPytVariants(basePrice) : buildPydVariants(basePrice);
    });
  }, [draft.saleType, draft.price]);

  const setSaleType = (saleType: LiveLotSaleType) => {
    setDraft((prev) => ({ ...prev, saleType }));
    setSpotDrafts([]);
  };

  const pickPhoto = async () => {
    setImageError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos access needed', 'Allow photo library access to add a product photo.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.86,
    });
    if (picked.canceled || !picked.assets[0]?.uri) return;
    const asset = picked.assets[0];
    if (asset.fileSize && asset.fileSize > THUMBNAIL_MAX_BYTES) {
      setImageError('Photo must be 20MB or smaller.');
      return;
    }
    setImageUri(asset.uri);
    setImageUrl(null);
    setImageUploading(true);
    try {
      const url = await uploadListingImageViaWeb(accessToken, asset.uri);
      setImageUrl(url);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'Could not upload photo.');
      setImageUri(null);
    } finally {
      setImageUploading(false);
    }
  };

  const saveToShow = (addAnother: boolean) => {
    if (!imageUrl?.trim()) {
      Alert.alert('Photo required', 'Add one product photo before saving to the show.');
      return;
    }
    const validated = validateQuickLiveLot({ ...draft, spotDrafts });
    if (!validated.ok) {
      Alert.alert('Add product', validated.message);
      return;
    }
    onSubmit({ ...validated.values, imageUrl: imageUrl.trim() }, { addAnother });
    if (addAnother) resetDraft();
  };

  const priceLabel =
    draft.saleType === 'auction'
      ? 'Starting bid'
      : draft.saleType === 'pyt'
        ? 'Price per team'
        : draft.saleType === 'pyd'
          ? 'Price per division'
          : 'Buy-it-now price';
  const pricePlaceholder =
    draft.saleType === 'auction' ? '1' : draft.saleType === 'pyt' || draft.saleType === 'pyd' ? '25' : '25';
  const breakSpots = breakSpotCountForSaleType(draft.saleType);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={() => Keyboard.dismiss()} accessibilityLabel="Dismiss keyboard" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) + keyboardInset }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.handle} />
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close add product">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.title}>Add to show</Text>
            <Text style={styles.sub}>Photo, title, pricing, and quantity — queue as many lots as you need.</Text>

            <Text style={styles.fieldLbl}>Photo</Text>
            <Pressable
              style={[styles.photoBox, imageUri && styles.photoBoxFilled]}
              onPress={() => void pickPhoto()}
              disabled={busy || imageUploading}
            >
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.photoPreview} contentFit="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera-outline" size={28} color={colors.gold} />
                  <Text style={styles.photoPlaceholderTxt}>Add photo</Text>
                </View>
              )}
              {imageUploading ? (
                <View style={styles.photoUploading}>
                  <ActivityIndicator color={colors.gold} />
                </View>
              ) : null}
            </Pressable>
            {imageError ? <Text style={styles.errorTxt}>{imageError}</Text> : null}

            <Text style={styles.fieldLbl}>Title</Text>
            <TextInput
              value={draft.title}
              onChangeText={(title) => setDraft((prev) => ({ ...prev, title }))}
              placeholder="e.g. PSA 10 rookie chase"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              editable={!busy}
            />

            <Text style={styles.fieldLbl}>Sale type</Text>
            <View style={styles.saleTypeGrid}>
              {(
                [
                  { id: 'auction', label: 'Auction', sub: 'Timed bidding' },
                  { id: 'buy_now', label: 'Buy It Now', sub: 'Fixed price' },
                  { id: 'pyt', label: 'PYT', sub: 'Pick your team' },
                  { id: 'pyd', label: 'PYD', sub: 'Pick division' },
                  { id: 'random_pyt', label: 'Random Teams', sub: '32 · wheel' },
                  { id: 'random_pyd', label: 'Random Divisions', sub: '8 · wheel' },
                ] as const
              ).map((type) => {
                const active = draft.saleType === type.id;
                return (
                  <Pressable
                    key={type.id}
                    style={[styles.saleTypeCard, active && styles.saleTypeCardActive]}
                    onPress={() => setSaleType(type.id)}
                    disabled={busy}
                  >
                    <Text style={[styles.saleTypeLabel, active && styles.saleTypeLabelActive]}>{type.label}</Text>
                    <Text style={[styles.saleTypeSub, active && styles.saleTypeSubActive]}>{type.sub}</Text>
                  </Pressable>
                );
              })}
            </View>

            {isBreakLotSaleType(draft.saleType) ? (
              <View style={styles.breakHint}>
                <Ionicons name="grid-outline" size={16} color={colors.gold} />
                <Text style={styles.breakHintTxt}>
                  Buyers pick from {breakSpots} selectable spots. Sold spots disappear from the board.
                </Text>
              </View>
            ) : null}

            <Text style={styles.fieldLbl}>{priceLabel}</Text>
            <TextInput
              value={draft.price}
              onChangeText={(price) => setDraft((prev) => ({ ...prev, price }))}
              placeholder={pricePlaceholder}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              style={styles.input}
              editable={!busy}
            />

            {isPickBreakLotSaleType(draft.saleType) && spotDrafts.length > 0 ? (
              <BreakSpotSetupGrid
                saleType={draft.saleType}
                spots={spotDrafts}
                onChange={setSpotDrafts}
                disabled={busy}
              />
            ) : null}

            <Text style={styles.fieldLbl}>Quantity</Text>
            <TextInput
              value={draft.quantity}
              onChangeText={(quantity) => setDraft((prev) => ({ ...prev, quantity }))}
              placeholder="1"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              style={[styles.input, isBreakLotSaleType(draft.saleType) && styles.inputDisabled]}
              editable={!busy && !isBreakLotSaleType(draft.saleType)}
            />

            {draft.saleType === 'auction' ? (
              <>
                <Text style={styles.fieldLbl}>Reserve (optional)</Text>
                <TextInput
                  value={draft.reservePrice}
                  onChangeText={(reservePrice) => setDraft((prev) => ({ ...prev, reservePrice }))}
                  placeholder="Hidden minimum"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  style={styles.input}
                  editable={!busy}
                />
                <Text style={styles.fieldLbl}>Buy it now (optional)</Text>
                <TextInput
                  value={draft.buyNowPrice}
                  onChangeText={(buyNowPrice) => setDraft((prev) => ({ ...prev, buyNowPrice }))}
                  placeholder="Instant purchase price"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  style={styles.input}
                  editable={!busy}
                />
              </>
            ) : null}

            <View style={styles.actionRow}>
              <Pressable
                style={[styles.secondary, (busy || imageUploading) && styles.primaryOff]}
                onPress={() => saveToShow(true)}
                disabled={busy || imageUploading}
              >
                <Text style={styles.secondaryTxt}>{busy ? 'Saving…' : 'Save & add another'}</Text>
              </Pressable>
              <Pressable
                style={[styles.primary, styles.primaryFlex, (busy || imageUploading) && styles.primaryOff]}
                onPress={() => saveToShow(false)}
                disabled={busy || imageUploading}
              >
                <Text style={styles.primaryTxt}>{busy ? 'Saving…' : 'Save to show'}</Text>
              </Pressable>
            </View>
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
  title: { fontSize: 20, fontWeight: '900', color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.xs },
  fieldLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  photoBox: {
    height: 148,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBoxFilled: { borderStyle: 'solid' },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: { alignItems: 'center', gap: 6 },
  photoPlaceholderTxt: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  photoUploading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTxt: { fontSize: 12, color: '#fca5a5' },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    borderRadius: radii.md,
    padding: 12,
    minHeight: 44,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.35)',
    fontSize: 15,
  },
  inputDisabled: { opacity: 0.45 },
  saleTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  saleTypeCard: {
    width: '47%',
    flexGrow: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 12,
    paddingHorizontal: 10,
    minHeight: 64,
    justifyContent: 'center',
  },
  saleTypeCardActive: {
    borderColor: 'rgba(212,175,55,0.55)',
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  saleTypeLabel: { fontSize: 14, fontWeight: '900', color: colors.textMuted },
  saleTypeLabelActive: { color: colors.gold },
  saleTypeSub: { marginTop: 2, fontSize: 11, fontWeight: '600', color: colors.textMuted },
  saleTypeSubActive: { color: 'rgba(255,215,80,0.75)' },
  breakHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.22)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  breakHintTxt: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  primary: {
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryFlex: { flex: 1 },
  primaryOff: { opacity: 0.55 },
  primaryTxt: { fontWeight: '900', color: '#0a0a0a', fontSize: 15 },
  secondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryTxt: { fontWeight: '800', color: colors.textSecondary, fontSize: 13 },
});
