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
import {
  fetchLiveHostShippingDashboard,
  liveHostDefaultProfileId,
  liveHostShippingProfileOptions,
} from '../../../api/liveHostShippingRepository';
import {
  fetchLiveRoomShopInventory,
  fetchPriorLiveRoomsForCopy,
  type LiveShopInventoryListing,
  type PriorLiveRoomOption,
} from '../../../api/liveRoomControlRepository';
import { uploadListingImageViaWeb } from '../../../api/webListingsRepository';
import {
  breakSpotCountForSaleType,
  emptyQuickLiveLotInput,
  isBreakLotSaleType,
  isPickBreakLotSaleType,
  parseUsdInput,
  syncPickBreakSpotDrafts,
  validateQuickLiveLot,
  type LiveLotSaleType,
  type QuickLiveLotInput,
  type QuickLiveLotValues,
} from '../../../lib/liveAuctionPricing';
import type { LiveBreakVariantDraft } from '../../../lib/liveBreakPresets';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { RANDOM_BREAK_SALE_TYPES_ENABLED } from '../../../../../shared/live-break-feature-flags';
import { useKeyboardInset } from '../../wallet/walletSheetKeyboard';
import { colors, radii, spacing } from '../../../theme';
import { BreakSpotSetupGrid } from './BreakSpotSetupGrid';

const THUMBNAIL_MAX_BYTES = 20 * 1024 * 1024;

type SaleCategory = 'teams_divisions' | 'auction' | 'buy_now';
type BreakSaleType = 'pyt' | 'pyd' | 'random_pyt' | 'random_pyd';
type AddSourceTab = 'new' | 'shop' | 'copy';

const SALE_CATEGORIES: { id: SaleCategory; label: string; sub: string }[] = [
  {
    id: 'teams_divisions',
    label: SELLER_CONSOLE.saleCategoryTeamsDivisions,
    sub: RANDOM_BREAK_SALE_TYPES_ENABLED ? 'Pick or random spots' : 'Pick your team or division',
  },
  { id: 'auction', label: SELLER_CONSOLE.saleCategoryAuction, sub: 'Timed bidding' },
  { id: 'buy_now', label: SELLER_CONSOLE.saleCategoryBuyNow, sub: 'Fixed price' },
];

const BREAK_VARIANTS: { id: BreakSaleType; label: string; sub: string }[] = [
  { id: 'pyt', label: 'PYT', sub: 'Pick your team' },
  { id: 'pyd', label: 'PYD', sub: 'Pick division' },
  { id: 'random_pyt', label: 'Random Teams', sub: '32 · vault reveal' },
  { id: 'random_pyd', label: 'Random Divisions', sub: '8 · vault reveal' },
];

/** Sale-type picker options actually shown to sellers — random breaks stay in `BREAK_VARIANTS` but are hidden while disabled. */
const VISIBLE_BREAK_VARIANTS = RANDOM_BREAK_SALE_TYPES_ENABLED
  ? BREAK_VARIANTS
  : BREAK_VARIANTS.filter((v) => v.id === 'pyt' || v.id === 'pyd');

function saleCategoryForType(saleType: LiveLotSaleType): SaleCategory {
  if (saleType === 'buy_now') return 'buy_now';
  if (saleType === 'auction') return 'auction';
  return 'teams_divisions';
}

export type QuickLiveLotSubmitPayload = QuickLiveLotValues & {
  imageUrl: string;
  sellerShippingProfileId?: string | null;
  shippingProfileId?: string | null;
};

export type QuickLiveLotSubmitOptions = {
  addAnother?: boolean;
};

export function AddInventoryModal({
  visible,
  accessToken,
  roomId,
  busy,
  onClose,
  onSubmit,
  onSubmitFromShop,
  onImportFromPriorRoom,
}: {
  visible: boolean;
  accessToken: string;
  roomId: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (payload: QuickLiveLotSubmitPayload, options?: QuickLiveLotSubmitOptions) => void;
  onSubmitFromShop?: (listingIds: string[]) => void;
  onImportFromPriorRoom?: (sourceRoomId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const [addSource, setAddSource] = useState<AddSourceTab>('new');
  const [draft, setDraft] = useState<QuickLiveLotInput>(emptyQuickLiveLotInput());
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [spotDrafts, setSpotDrafts] = useState<LiveBreakVariantDraft[]>([]);
  const [spotsCustomized, setSpotsCustomized] = useState(false);
  const [profileOptions, setProfileOptions] = useState<{ id: string; name: string; isDefault?: boolean }[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [profileOptionsAreSeller, setProfileOptionsAreSeller] = useState(true);
  const [shopListings, setShopListings] = useState<LiveShopInventoryListing[]>([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
  const [shopQuery, setShopQuery] = useState('');
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const [priorRooms, setPriorRooms] = useState<PriorLiveRoomOption[]>([]);
  const [priorLoading, setPriorLoading] = useState(false);
  const [priorError, setPriorError] = useState<string | null>(null);
  const [selectedPriorRoomId, setSelectedPriorRoomId] = useState('');

  const resetDraft = () => {
    setAddSource('new');
    setDraft(emptyQuickLiveLotInput());
    setSpotDrafts([]);
    setSpotsCustomized(false);
    setImageUri(null);
    setImageUrl(null);
    setImageUploading(false);
    setImageError(null);
    setSelectedProfileId('');
    setShopListings([]);
    setShopError(null);
    setShopQuery('');
    setSelectedShopIds([]);
    setPriorRooms([]);
    setPriorError(null);
    setSelectedPriorRoomId('');
  };

  useEffect(() => {
    if (!visible || !accessToken.trim() || !roomId.trim()) return;
    let cancelled = false;
    void fetchLiveHostShippingDashboard(accessToken, roomId).then((dashboard) => {
      if (cancelled || !dashboard) return;
      const options = liveHostShippingProfileOptions(dashboard);
      setProfileOptions(options);
      setProfileOptionsAreSeller(dashboard.sellerProfiles.length > 0);
      setSelectedProfileId(liveHostDefaultProfileId(dashboard) || options[0]?.id || '');
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, roomId, visible]);

  useEffect(() => {
    if (visible) resetDraft();
  }, [visible]);

  useEffect(() => {
    if (!visible || !accessToken.trim() || !roomId.trim() || addSource !== 'shop') return;
    let cancelled = false;
    setShopLoading(true);
    setShopError(null);
    void fetchLiveRoomShopInventory(accessToken, roomId)
      .then((rows) => {
        if (cancelled) return;
        setShopListings(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setShopError(e instanceof Error ? e.message : 'Could not load shop inventory.');
        setShopListings([]);
      })
      .finally(() => {
        if (!cancelled) setShopLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, addSource, roomId, visible]);

  useEffect(() => {
    if (!visible || !accessToken.trim() || !roomId.trim() || addSource !== 'copy') return;
    let cancelled = false;
    setPriorLoading(true);
    setPriorError(null);
    void fetchPriorLiveRoomsForCopy(accessToken, roomId)
      .then((rooms) => {
        if (cancelled) return;
        setPriorRooms(rooms);
        setSelectedPriorRoomId((prev) => prev || rooms[0]?.id || '');
      })
      .catch((e) => {
        if (cancelled) return;
        setPriorError(e instanceof Error ? e.message : 'Could not load prior shows.');
        setPriorRooms([]);
      })
      .finally(() => {
        if (!cancelled) setPriorLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, addSource, roomId, visible]);

  useEffect(() => {
    if (!isPickBreakLotSaleType(draft.saleType)) {
      setSpotDrafts([]);
      setSpotsCustomized(false);
      return;
    }
    const basePrice = parseUsdInput(draft.price);
    const saleType = draft.saleType;
    if (saleType !== 'pyt' && saleType !== 'pyd') return;
    setSpotDrafts((prev) =>
      syncPickBreakSpotDrafts({
        prev,
        saleType,
        basePrice,
        spotsCustomized,
      }),
    );
  }, [draft.saleType, draft.price, spotsCustomized]);

  const setSaleType = (saleType: LiveLotSaleType) => {
    setDraft((prev) => ({ ...prev, saleType }));
    setSpotDrafts([]);
    setSpotsCustomized(false);
  };

  const saleCategory = saleCategoryForType(draft.saleType);
  const breakSaleType: BreakSaleType = isBreakLotSaleType(draft.saleType) ? draft.saleType : 'pyt';

  const setSaleCategory = (category: SaleCategory) => {
    if (category === 'auction') setSaleType('auction');
    else if (category === 'buy_now') setSaleType('buy_now');
    else setSaleType(breakSaleType);
  };

  const handleSpotDraftsChange = (next: LiveBreakVariantDraft[]) => {
    setSpotDrafts((prev) => {
      if (prev.length === next.length && next.some((spot, index) => spot.priceUsd !== prev[index]?.priceUsd)) {
        setSpotsCustomized(true);
      }
      return next;
    });
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
    if (!selectedProfileId.trim()) {
      Alert.alert('Shipping profile', 'Select a shipping profile for this lot.');
      return;
    }
    const profilePayload = profileOptionsAreSeller
      ? { sellerShippingProfileId: selectedProfileId }
      : { shippingProfileId: selectedProfileId };
    onSubmit({ ...validated.values, imageUrl: imageUrl.trim(), ...profilePayload }, { addAnother });
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
            <View style={styles.sourceTabs}>
              {(
                [
                  { id: 'new' as const, label: SELLER_CONSOLE.addSourceNew },
                  { id: 'shop' as const, label: SELLER_CONSOLE.addSourceShop },
                  { id: 'copy' as const, label: SELLER_CONSOLE.addSourceCopyShow },
                ] as const
              ).map((tab) => {
                const on = addSource === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    style={[styles.sourceTab, on && styles.sourceTabOn]}
                    onPress={() => setAddSource(tab.id)}
                    disabled={busy}
                  >
                    <Text style={[styles.sourceTabTxt, on && styles.sourceTabTxtOn]} numberOfLines={1}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {addSource === 'shop' ? (
              <>
                <Text style={styles.sub}>{SELLER_CONSOLE.addSourceShopHint}</Text>
                <TextInput
                  value={shopQuery}
                  onChangeText={setShopQuery}
                  placeholder="Search your shop…"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  editable={!busy}
                />
                {shopLoading ? <ActivityIndicator color={colors.gold} style={{ marginVertical: 12 }} /> : null}
                {shopError ? <Text style={styles.errorTxt}>{shopError}</Text> : null}
                {!shopLoading && !shopError && shopListings.length === 0 ? (
                  <Text style={styles.sub}>
                    No reusable shop items yet. Add inventory under Seller HQ → Live show, then pull them in here.
                  </Text>
                ) : null}
                {shopListings
                  .filter((row) => {
                    const q = shopQuery.trim().toLowerCase();
                    if (!q) return true;
                    return row.title.toLowerCase().includes(q);
                  })
                  .map((row) => {
                    const selected = selectedShopIds.includes(row.id);
                    const disabled = (!row.available && !selected) || Boolean(busy);
                    const priceLabel =
                      row.buyingFormat === 'auction'
                        ? `Start $${Math.round(row.startingBidUsd ?? row.priceUsd ?? 0)}`
                        : `$${Math.round(row.priceUsd ?? 0)}`;
                    return (
                      <Pressable
                        key={row.id}
                        style={[styles.shopRow, selected && styles.shopRowOn, disabled && styles.primaryOff]}
                        onPress={() => {
                          if (disabled && !selected) return;
                          setSelectedShopIds((prev) =>
                            prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id],
                          );
                        }}
                        disabled={disabled && !selected}
                      >
                        <Image source={{ uri: row.imageUrl }} style={styles.shopThumb} contentFit="cover" />
                        <View style={styles.shopMeta}>
                          <Text style={styles.shopTitle} numberOfLines={2}>
                            {row.title}
                          </Text>
                          <Text style={styles.shopSub} numberOfLines={2}>
                            {row.inventoryChannel === 'live_show' ? 'Live show' : 'Marketplace'} · {priceLabel}
                            {row.alreadyInQueue ? ' · Already in lineup' : ''}
                            {row.inventoryHeld ? ' · Held in checkout' : ''}
                          </Text>
                        </View>
                        <Ionicons
                          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={22}
                          color={selected ? colors.gold : colors.textMuted}
                        />
                      </Pressable>
                    );
                  })}
                <Pressable
                  style={[
                    styles.primary,
                    (busy || selectedShopIds.length === 0 || !onSubmitFromShop) && styles.primaryOff,
                  ]}
                  onPress={() => {
                    if (!onSubmitFromShop || selectedShopIds.length === 0) {
                      Alert.alert('From my shop', 'Select at least one item.');
                      return;
                    }
                    onSubmitFromShop(selectedShopIds);
                  }}
                  disabled={busy || selectedShopIds.length === 0 || !onSubmitFromShop}
                >
                  <Text style={styles.primaryTxt}>
                    {busy ? 'Adding…' : `Add ${selectedShopIds.length || ''} to lineup`}
                  </Text>
                </Pressable>
              </>
            ) : addSource === 'copy' ? (
              <>
                <Text style={styles.sub}>{SELLER_CONSOLE.addSourceCopyHint}</Text>
                {priorLoading ? <ActivityIndicator color={colors.gold} style={{ marginVertical: 12 }} /> : null}
                {priorError ? <Text style={styles.errorTxt}>{priorError}</Text> : null}
                {!priorLoading && !priorError && priorRooms.length === 0 ? (
                  <Text style={styles.sub}>No prior shows found to copy from.</Text>
                ) : null}
                {priorRooms.map((room) => {
                  const selected = selectedPriorRoomId === room.id;
                  return (
                    <Pressable
                      key={room.id}
                      style={[styles.shopRow, selected && styles.shopRowOn]}
                      onPress={() => setSelectedPriorRoomId(room.id)}
                      disabled={busy}
                    >
                      <View style={styles.shopMeta}>
                        <Text style={styles.shopTitle} numberOfLines={2}>
                          {room.title || 'Untitled show'}
                        </Text>
                        <Text style={styles.shopSub}>{room.status}</Text>
                      </View>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={selected ? colors.gold : colors.textMuted}
                      />
                    </Pressable>
                  );
                })}
                <Pressable
                  style={[
                    styles.primary,
                    (busy || !selectedPriorRoomId || !onImportFromPriorRoom) && styles.primaryOff,
                  ]}
                  onPress={() => {
                    if (!onImportFromPriorRoom || !selectedPriorRoomId) {
                      Alert.alert('Copy last show', 'Pick a previous show to copy from.');
                      return;
                    }
                    onImportFromPriorRoom(selectedPriorRoomId);
                  }}
                  disabled={busy || !selectedPriorRoomId || !onImportFromPriorRoom}
                >
                  <Text style={styles.primaryTxt}>{busy ? 'Copying…' : 'Copy unsold lineup'}</Text>
                </Pressable>
              </>
            ) : (
              <>
            <Text style={styles.sub}>Title, photo, pricing, and quantity — queue as many lots as you need.</Text>

            <Text style={styles.fieldLbl}>Title</Text>
            <TextInput
              value={draft.title}
              onChangeText={(title) => setDraft((prev) => ({ ...prev, title }))}
              placeholder="e.g. PSA 10 rookie chase"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              editable={!busy}
            />

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

            <Text style={styles.fieldLbl}>Sale type</Text>
            <View style={styles.saleCategoryRow}>
              {SALE_CATEGORIES.map((type) => {
                const active = saleCategory === type.id;
                return (
                  <Pressable
                    key={type.id}
                    style={[styles.saleCategoryCard, active && styles.saleTypeCardActive]}
                    onPress={() => setSaleCategory(type.id)}
                    disabled={busy}
                  >
                    <Text style={[styles.saleCategoryLabel, active && styles.saleTypeLabelActive]}>{type.label}</Text>
                    <Text style={[styles.saleTypeSub, active && styles.saleTypeSubActive]}>{type.sub}</Text>
                  </Pressable>
                );
              })}
            </View>

            {saleCategory === 'teams_divisions' ? (
              <View style={styles.saleTypeGrid}>
                {VISIBLE_BREAK_VARIANTS.map((type) => {
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
            ) : null}

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
                onChange={handleSpotDraftsChange}
                disabled={busy}
              />
            ) : null}

            <Text style={styles.fieldLbl}>Shipping profile</Text>
            <View style={styles.profileWrap}>
              {profileOptions.map((profile) => {
                const selected = selectedProfileId === profile.id;
                return (
                  <Pressable
                    key={profile.id}
                    style={[styles.profileChip, selected && styles.profileChipOn]}
                    onPress={() => setSelectedProfileId(profile.id)}
                    disabled={busy}
                  >
                    <Text style={[styles.profileChipTxt, selected && styles.profileChipTxtOn]}>
                      {profile.name}
                      {profile.isDefault ? ' · default' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

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
              </>
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
  title: { fontSize: 20, fontWeight: '900', color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.xs },
  sourceTabs: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginBottom: spacing.xs,
  },
  sourceTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  sourceTabOn: {
    backgroundColor: 'rgba(212,175,55,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
  },
  sourceTabTxt: { fontSize: 10, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  sourceTabTxtOn: { color: colors.gold },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  shopRowOn: {
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  shopThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
  shopMeta: { flex: 1, minWidth: 0 },
  shopTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  shopSub: { marginTop: 2, fontSize: 11, color: colors.textMuted },
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
  saleCategoryRow: { flexDirection: 'row', gap: spacing.sm },
  saleCategoryCard: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 12,
    paddingHorizontal: 8,
    minHeight: 64,
    justifyContent: 'center',
  },
  saleCategoryLabel: { fontSize: 12, fontWeight: '900', color: colors.textMuted },
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
  profileWrap: { gap: 8, marginBottom: spacing.xs },
  profileChip: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  profileChipOn: {
    borderColor: 'rgba(212,175,55,0.55)',
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  profileChipTxt: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  profileChipTxtOn: { color: colors.gold },
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
