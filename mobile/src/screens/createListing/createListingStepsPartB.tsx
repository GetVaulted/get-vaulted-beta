import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  PublishListingError,
  publishCreateListingForm,
} from '../../api/listingsPublishRepository';
import { fetchSellerConnectStatus } from '../../api/stripeConnectRepository';
import { useAuth } from '../../auth/AuthContext';
import { clearHomeFeedCache } from '../../lib/homeFeedCache';
import { isSupabaseConfigured } from '../../lib/supabase';
import { rootNavigationRef } from '../../navigation/rootNavigationRef';
import { useCreateListingDraft } from '../../createListing/CreateListingDraftContext';
import {
  AUCTION_DURATION_DAY_OPTIONS,
  countListingPhotos,
  LISTING_CATEGORY_OPTIONS,
  LISTING_COMMERCE_OPTIONS,
  LISTING_MAX_PHOTOS,
  LISTING_MIN_PHOTOS,
} from '../../createListing/types';
import { LISTING_CHANNEL_CONFIG } from '../../createListing/listingChannel';
import { getLiveProfile, liveShippingStepComplete } from '../../createListing/liveShowShipping';
import {
  isPackageDetailsComplete,
  marketplaceShippingListingReady,
} from '../../createListing/shippoRates';
import type { CreateListingStackParamList } from '../../navigation/types';
import { CreateListingChrome } from './CreateListingChrome';
import { useCreateListingFlow } from './createListingFlowHelpers';
import { useCreateListingNavigation } from './useCreateListingNavigation';
import { colors, radii, spacing, typography } from '../../theme';

function Footer({
  onBack,
  onNext,
  nextLabel,
  disabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  disabled?: boolean;
}) {
  return (
    <View style={foot.row}>
      {onBack ? (
        <Pressable style={foot.back} onPress={onBack}>
          <Text style={foot.backTxt}>Back</Text>
        </Pressable>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <Pressable
        style={[foot.next, disabled && foot.nextOff]}
        onPress={() => !disabled && onNext()}
        disabled={disabled}
      >
        <Text style={foot.nextTxt}>{nextLabel}</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.background} />
      </Pressable>
    </View>
  );
}

const foot = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 'auto', paddingVertical: spacing.lg },
  back: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  backTxt: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
  next: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gold,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
  },
  nextOff: { opacity: 0.45 },
  nextTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
});

function feePreview(t: (typeof LISTING_COMMERCE_OPTIONS)[number]['id'] | null): string {
  switch (t) {
    case 'buy_now':
    case 'vault_drop':
      return 'Est. success fee ~4.5% · Vaulted checkout included';
    case 'auction':
    case 'live_auction':
      return 'Hammer fee ~6% · reserve holds optional';
    case 'break_spot':
      return 'Spot fee ~8% · lane tooling included';
    case 'trade_only':
      return 'Flat trade lane fee applies when offers lock';
    default:
      return 'Fees finalize at publish based on lane';
  }
}

export function CreateListingPricingScreen({
  navigation,
}: NativeStackScreenProps<CreateListingStackParamList, 'CreateListingPricing'>) {
  const { form, setForm } = useCreateListingDraft();
  const { channel, accent, totalSteps, isLiveShow, step } = useCreateListingFlow();
  const { exitFlow, goBackStep } = useCreateListingNavigation();
  const t = form.listingType;

  const applyAiPrice = () => {
    if (!form.aiSuggestedPrice.trim()) return;
    if (t === 'buy_now' || t === 'vault_drop') {
      setForm({
        buyNowPrice: form.aiSuggestedPrice,
        aiFieldBadges: { ...form.aiFieldBadges, buyNowPrice: 'confirmed' },
      });
    } else if (t === 'auction' || t === 'live_auction') {
      setForm({
        startingBid: form.aiSuggestedPrice,
        aiFieldBadges: { ...form.aiFieldBadges, startingBid: 'confirmed' },
      });
    }
  };

  const body = () => {
    if (t === 'buy_now' || t === 'vault_drop') {
      return (
        <Field
          label="Buy now price"
          value={form.buyNowPrice}
          onChange={(v) =>
            setForm({ buyNowPrice: v, aiFieldBadges: { ...form.aiFieldBadges, buyNowPrice: 'confirmed' } })
          }
          placeholder="$12,450"
        />
      );
    }
    if (t === 'auction' || t === 'live_auction') {
      return (
        <>
          <Field
            label="Starting bid"
            value={form.startingBid}
            onChange={(v) =>
              setForm({ startingBid: v, aiFieldBadges: { ...form.aiFieldBadges, startingBid: 'confirmed' } })
            }
            placeholder="$500"
          />
          <Field label="Reserve (optional)" value={form.reservePrice} onChange={(v) => setForm({ reservePrice: v })} placeholder="$8,000" />
          <Text style={styles.fieldLbl}>Auction length (days)</Text>
          <Text style={styles.auctionDurHint}>
            Timed auction — runs for the number of full days you select, then the highest bid wins. Marketplace default
            at checkout shows time remaining.
          </Text>
          <View style={styles.dayChipWrap}>
            {AUCTION_DURATION_DAY_OPTIONS.map((d) => {
              const sel = form.auctionDurationDays === String(d);
              return (
                <Pressable
                  key={d}
                  style={[styles.dayChip, sel && styles.dayChipOn]}
                  onPress={() => setForm({ auctionDurationDays: String(d) })}
                >
                  <Text style={[styles.dayChipTxt, sel && styles.dayChipTxtOn]}>{d} days</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      );
    }
    if (t === 'break_spot') {
      return (
        <>
          <Field label="Spots available" value={form.breakSpots} onChange={(v) => setForm({ breakSpots: v })} placeholder="30" />
          <Field label="Spot price" value={form.spotPrice} onChange={(v) => setForm({ spotPrice: v })} placeholder="$95" />
          <Field label="Team format" value={form.breakFormat} onChange={(v) => setForm({ breakFormat: v })} placeholder="Random teams" />
        </>
      );
    }
    if (t === 'trade_only') {
      return (
        <>
          <Field
            label="Trade interests"
            value={form.tradeInterests}
            onChange={(v) => setForm({ tradeInterests: v })}
            placeholder="What you want in return"
            multiline
          />
          <Field
            label="Wishlist tags"
            value={form.tradeWishlist}
            onChange={(v) => setForm({ tradeWishlist: v })}
            placeholder="Jordan rookies, Daytona, high-end slabs…"
            multiline
          />
        </>
      );
    }
    return <Text style={styles.hint}>Select a listing type to configure pricing.</Text>;
  };

  return (
    <CreateListingChrome
      step={step.pricing}
      total={totalSteps}
      channel={channel}
      title={isLiveShow ? 'Quick pricing' : 'Pricing'}
      subtitle={
        isLiveShow
          ? 'Set hammer, spot, or drop price — optimized for live velocity.'
          : 'Lane-specific economics — clean hierarchy, no spreadsheet energy.'
      }
      onBack={goBackStep}
      onExit={exitFlow}
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
        {form.aiSuggestedPrice ? (
          <View style={styles.aiPriceCard}>
            <Text style={styles.aiPriceK}>Pricing assistant</Text>
            <Text style={styles.aiPriceSuggested}>Suggested: {form.aiSuggestedPrice}</Text>
            <Text style={styles.aiPriceReason}>{form.aiPriceReasoning}</Text>
            <Text style={styles.aiPriceComps}>{form.aiComparableSalesPlaceholder}</Text>
            <Text style={styles.aiPriceDisclaimer}>
              Illustrative only — not guaranteed market value. You set the final price buyers see.
            </Text>
            <Pressable style={styles.aiPriceBtn} onPress={applyAiPrice}>
              <Text style={styles.aiPriceBtnTxt}>Use suggestion as starting price</Text>
            </Pressable>
          </View>
        ) : null}
        {body()}
        <Text style={styles.fee}>{feePreview(t)}</Text>
      </ScrollView>
      <Footer
        onBack={() => navigation.goBack()}
        onNext={() =>
          isLiveShow ? navigation.navigate('CreateListingLiveShipping') : navigation.navigate('CreateListingShipping')
        }
        nextLabel={isLiveShow ? 'Live shipping' : 'Continue'}
        disabled={
          t === 'buy_now' || t === 'vault_drop'
            ? !form.buyNowPrice.trim()
            : t === 'auction' || t === 'live_auction'
              ? !form.startingBid.trim()
              : t === 'break_spot'
                ? !form.spotPrice.trim()
                : t === 'trade_only'
                  ? !form.tradeInterests.trim()
                  : true
        }
      />
    </CreateListingChrome>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLbl}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, multiline && styles.inputMulti]}
        multiline={multiline}
      />
    </View>
  );
}

export { CreateListingShippingScreen } from './CreateListingShippingScreen';
export { CreateListingLiveShippingScreen } from './CreateListingLiveShippingScreen';

function Toggle({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLbl}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#333', true: 'rgba(212,175,55,0.45)' }} thumbColor={value ? colors.gold : '#888'} />
    </View>
  );
}

export function CreateListingReviewScreen({
  navigation,
}: NativeStackScreenProps<CreateListingStackParamList, 'CreateListingReview'>) {
  const { form, setForm, saveDraft, completeAfterPublish } = useCreateListingDraft();
  const { session, user } = useAuth();
  const [publishing, setPublishing] = useState(false);
  const { channel, accent, totalSteps, isLiveShow, step } = useCreateListingFlow();
  const channelCfg = LISTING_CHANNEL_CONFIG[channel];
  const { exitFlow, goBackStep } = useCreateListingNavigation();
  const thumb = form.media[0]?.uri;
  const liveProfile = getLiveProfile(form.liveShippingProfileId);
  const typeLabel = LISTING_COMMERCE_OPTIONS.find((x) => x.id === form.listingType)?.label ?? '—';
  const catLabel = form.category ? LISTING_CATEGORY_OPTIONS.find((c) => c.id === form.category)?.label : '—';
  const reviewStep = step.review;

  const photoCount = countListingPhotos(form.media);
  const photosValid = photoCount >= LISTING_MIN_PHOTOS && photoCount <= LISTING_MAX_PHOTOS;

  const needsAck =
    form.aiNeedsSellerConfirmation && form.aiReviewReasons.length > 0 && !form.aiAcknowledgedReviews;
  const needsMarketplaceShipping =
    !isLiveShow &&
    !marketplaceShippingListingReady(form) &&
    !(form.selectedShippoRate != null && isPackageDetailsComplete(form));
  const needsLiveShipping =
    isLiveShow &&
    !liveShippingStepComplete({
      liveShippingPreset: form.liveShippingPreset,
      liveShippingProfileId: form.liveShippingProfileId,
      liveShipFromZip: form.liveShipFromZip,
      liveBundleEligible: form.liveBundleEligible,
      liveAdvancedWeightLb: form.liveAdvancedWeightLb,
      liveAdvancedLengthIn: form.liveAdvancedLengthIn,
      liveAdvancedWidthIn: form.liveAdvancedWidthIn,
      liveAdvancedHeightIn: form.liveAdvancedHeightIn,
    });
  const canPublish = photosValid && !needsAck && !needsMarketplaceShipping && !needsLiveShipping;

  const verificationLine =
    form.verificationSource === 'visible_in_media'
      ? 'Authentication visible in uploaded imagery — not proof of authenticity without Vaulted verification.'
      : form.verificationSource === 'seller_provided'
        ? 'Seller-provided credentials — AI does not guarantee authenticity.'
        : 'No authentication evidence highlighted — consider Vaulted Verification before going live.';

  const onPublish = async () => {
    if (publishing) return;

    if (!photosValid) {
      Alert.alert(
        'Photos required',
        photoCount < LISTING_MIN_PHOTOS
          ? `Add at least ${LISTING_MIN_PHOTOS} photos on the Upload step before publishing.`
          : `Listings support up to ${LISTING_MAX_PHOTOS} photos. Remove extras on the Upload step.`,
      );
      return;
    }
    if (!canPublish) {
      const shipMsg = needsAck
        ? 'Confirm you reviewed AI-flagged details before publishing.'
        : needsLiveShipping
          ? 'Complete live shipping — choose a profile and a valid 5-digit ship-from ZIP (Advanced adds package weight and dimensions).'
          : needsMarketplaceShipping
            ? 'Complete Shipping preferences — valid parcel, successful rate preview, and at least one buyer-facing option after your rules.'
            : 'Fix remaining issues before publishing.';
      Alert.alert('Cannot publish yet', shipMsg);
      return;
    }

    if (!isSupabaseConfigured() || !user?.id) {
      Alert.alert('Sign in required', 'Sign in to publish listings to the vault.');
      return;
    }

    const token = session?.access_token;
    if (token) {
      const { status: st } = await fetchSellerConnectStatus(token);
      if (st?.stripeConfigured && !st.can_publish_active_listings) {
        Alert.alert(
          'Finish payout setup',
          st.message_onboarding ?? 'Complete Stripe Connect under Seller HQ → Seller Payout Setup before publishing active listings or going live.',
        );
        return;
      }
    }

    setPublishing(true);
    try {
      const { listingId, preview } = await publishCreateListingForm(user.id, form);
      completeAfterPublish(preview);
      await clearHomeFeedCache();

      const marketplaceLive = !isLiveShow;
      Alert.alert(
        isLiveShow ? 'Added to live queue' : 'Listed on marketplace',
        isLiveShow
          ? 'This item is saved to your vault and queued in HQ → Live show listings.'
          : 'Your listing is live in the vault — it will appear in Marketplace and Home.',
      );

      navigation.getParent()?.goBack();

      if (marketplaceLive && rootNavigationRef.isReady()) {
        rootNavigationRef.navigate('ProductDetail', { productId: listingId });
      }
    } catch (e) {
      const message =
        e instanceof PublishListingError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not publish listing.';
      Alert.alert('Publish failed', message);
    } finally {
      setPublishing(false);
    }
  };

  const onSaveDraft = () => {
    saveDraft();
    Alert.alert(
      'Draft saved',
      isLiveShow ? 'Resume from HQ → Live show listings.' : 'Resume from HQ → Marketplace listings.',
    );
    navigation.getParent()?.goBack();
  };

  const sellerPrice =
    form.listingType === 'trade_only'
      ? 'Trade lane'
      : form.buyNowPrice.trim() || form.startingBid.trim() || form.spotPrice.trim() || '—';

  return (
    <CreateListingChrome
      step={reviewStep}
      total={totalSteps}
      channel={channel}
      title={isLiveShow ? 'Review & queue' : 'Review & publish'}
      subtitle={
        isLiveShow
          ? 'Confirm on-air placement before adding to your show inventory.'
          : 'Acquisition preview · marketplace discovery · verification upsells.'
      }
      onBack={goBackStep}
      onExit={exitFlow}
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
        <LinearGradient colors={[accent.fill, '#0f0f0f']} style={styles.previewCard}>
          {thumb ? <Image source={{ uri: thumb }} style={styles.previewImg} resizeMode="cover" /> : null}
          <Text style={[styles.previewEyebrow, { color: accent.primary }]}>{channelCfg.shortLabel} preview</Text>
          <Text style={styles.previewTitle}>{form.title.trim() || 'Untitled listing'}</Text>
          <Text style={styles.previewMeta}>
            {typeLabel} · {catLabel}
          </Text>
          {form.subcategories.length > 0 ? (
            <Text style={styles.previewTags}>Sub-categories: {form.subcategories.join(' · ')}</Text>
          ) : null}
          {isLiveShow && form.liveShowTitle.trim() ? (
            <Text style={styles.previewTags}>Show: {form.liveShowTitle}</Text>
          ) : null}
          {form.tags.trim() ? <Text style={styles.previewTags}>Tags: {form.tags}</Text> : null}
          <Text style={styles.previewFee}>{feePreview(form.listingType)}</Text>
        </LinearGradient>

        <Text style={styles.blockK}>Seller-confirmed economics</Text>
        <Text style={styles.blockBody}>Your price: {sellerPrice}</Text>
        {form.aiSuggestedPrice ? (
          <Text style={styles.blockMuted}>AI suggested (reference only): {form.aiSuggestedPrice}</Text>
        ) : null}

        <Text style={styles.blockK}>Shipping & fees</Text>
        {isLiveShow ? (
          <>
            <Text style={styles.blockBody}>
              Live profile: {liveProfile?.label ?? '—'} · {form.liveShippingPreset === 'advanced' ? 'Advanced' : 'Simplified'}
            </Text>
            <Text style={styles.blockBody}>
              Ship from: {form.liveShipFromZip.trim() || '—'}
              {form.liveBundleEligible ? ' · Eligible for in-show bundling' : ' · Single-line shipping (not bundled)'}
            </Text>
            <Text style={styles.blockBody}>
              {liveProfile && !liveProfile.internationalEligible
                ? 'Domestic only (profile)'
                : form.liveShipInternational
                  ? 'International buyers allowed'
                  : 'Domestic only'}
              {' '}
              · Shippo runs under the hood — buyers see tier-based bundles in the show, not marketplace rates.
            </Text>
            {form.liveHandlingSurcharge.trim() ? (
              <Text style={styles.blockMuted}>Handling surcharge: {form.liveHandlingSurcharge}</Text>
            ) : null}
            {form.liveShippingPreset === 'advanced' ? (
              <Text style={styles.blockMuted}>
                Adv. package: {form.liveAdvancedWeightLb.trim() || '—'} lb · {form.liveAdvancedLengthIn.trim() || '—'}×
                {form.liveAdvancedWidthIn.trim() || '—'}×{form.liveAdvancedHeightIn.trim() || '—'} in
              </Text>
            ) : null}
          </>
        ) : marketplaceShippingListingReady(form) ||
          (form.selectedShippoRate != null && isPackageDetailsComplete(form)) ? (
          <>
            <Text style={styles.blockBody}>
              Buyer-chosen delivery — checkout loads live Shippo quotes; the default is the best-value option. Faster
              options show when you allow them. You print the exact label and service the buyer paid for.
            </Text>
            <Text style={styles.blockBody}>
              {form.marketplaceShippingOfferScope === 'all'
                ? 'You allow: all carrier services returned for this parcel.'
                : form.marketplaceShippingOfferScope === 'no_overnight'
                  ? 'You allow: economy & standard lanes (overnight-style services excluded).'
                  : `You allow: ${form.marketplaceOfferableRateCount} specific service(s).`}
            </Text>
            <Text style={styles.blockBody}>
              Package lane · ship from {form.shipFromZip.trim() || '—'}
              {form.shippingHandlingFee.trim() ? ` · Handling add-on ${form.shippingHandlingFee}` : ''}
            </Text>
            <Text style={styles.blockMuted}>
              {form.insurance ? 'Insurance available at label purchase · ' : ''}
              {form.signature ? 'Signature option · ' : ''}
              {form.international ? 'International quoting on' : 'Domestic benchmark lane'}
            </Text>
            <Text style={styles.blockMuted}>Faster delivery options available at checkout.</Text>
          </>
        ) : (
          <Text style={styles.blockBody}>
            Complete Shipping preferences — package details, rate preview, and at least one buyer-facing option.
          </Text>
        )}
        <Text style={styles.blockMuted}>{feePreview(form.listingType)}</Text>

        <Text style={styles.blockK}>Verification status</Text>
        <Text style={styles.blockBody}>{verificationLine}</Text>
        {form.vaultedVerification ? (
          <Text style={styles.blockMuted}>Vaulted Verification add-on selected at publish.</Text>
        ) : null}

        {form.aiNeedsSellerConfirmation ? (
          <>
            <Text style={styles.blockK}>Needs seller confirmation</Text>
            {form.aiReviewReasons.map((r) => (
              <Text key={r} style={styles.blockBody}>
                · {r}
              </Text>
            ))}
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLbl}>I reviewed uncertain AI fields</Text>
              <Switch
                value={form.aiAcknowledgedReviews}
                onValueChange={(v) => setForm({ aiAcknowledgedReviews: v })}
                trackColor={{ false: '#333', true: 'rgba(212,175,55,0.45)' }}
                thumbColor={form.aiAcknowledgedReviews ? colors.gold : '#888'}
              />
            </View>
          </>
        ) : null}

        <Text style={styles.blockK}>{isLiveShow ? 'Live placement' : 'Marketplace placement'}</Text>
        <Text style={styles.blockBody}>
          {isLiveShow
            ? 'Queued for your upcoming live show — can convert to marketplace after the show ends.'
            : 'Discover rails + SEO discovery — can be pulled into a live show queue later.'}
        </Text>

        <Text style={styles.blockK}>Mobile preview</Text>
        <View style={styles.mobileShell}>
          <View style={styles.mobileNotch} />
          <View style={styles.mobileInner}>
            {thumb ? <Image source={{ uri: thumb }} style={styles.mobileThumb} resizeMode="cover" /> : null}
            <Text style={styles.mobileTitle} numberOfLines={2}>
              {form.title.trim() || 'Untitled listing'}
            </Text>
            <Text style={styles.mobileMeta}>{typeLabel}</Text>
            <Text style={styles.mobilePrice}>
              {form.listingType === 'trade_only'
                ? 'Trade lane'
                : form.buyNowPrice.trim() || form.startingBid.trim() || form.spotPrice.trim() || '—'}
            </Text>
          </View>
        </View>

        <Text style={styles.blockK}>Live integration</Text>
        <Toggle
          label="Feature in upcoming live show"
          value={form.featureInLive}
          onValueChange={(v) => setForm({ featureInLive: v, selectedLiveShowId: v ? form.selectedLiveShowId : null })}
        />
        {form.featureInLive ? (
          <Text style={styles.blockBody}>
            After your listing is live, open Seller HQ to attach it to a scheduled show. There are no bundled demo
            shows in the app.
          </Text>
        ) : null}

        <Text style={styles.blockK}>Trade integration</Text>
        <Toggle label="Accept trade offers" value={form.acceptTrades} onValueChange={(v) => setForm({ acceptTrades: v })} />

        <Text style={styles.blockK}>Verification upsells</Text>
        <Toggle label="Vaulted Verification" value={form.vaultedVerification} onValueChange={(v) => setForm({ vaultedVerification: v })} />
        <Toggle label="White Glove Inspection" value={form.whiteGlove} onValueChange={(v) => setForm({ whiteGlove: v })} />
        <Toggle label="Escrow Protection" value={form.escrowProtection} onValueChange={(v) => setForm({ escrowProtection: v })} />

        <View style={styles.dual}>
          <Pressable style={styles.draftBtn} onPress={onSaveDraft}>
            <Text style={styles.draftTxt}>Save draft</Text>
          </Pressable>
          <Pressable
            style={[styles.pubBtn, (!canPublish || publishing) && styles.pubBtnOff]}
            onPress={() => void onPublish()}
            disabled={!canPublish || publishing}
          >
            {publishing ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <>
                <Text style={styles.pubTxt}>Publish listing</Text>
                <Ionicons name="rocket-outline" size={18} color={colors.background} />
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </CreateListingChrome>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxxl, gap: spacing.md },
  fieldBlock: { gap: spacing.xs },
  fieldLbl: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
    backgroundColor: colors.surface,
  },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  fee: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  hint: { color: colors.textMuted, fontSize: 14 },
  auctionDurHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing.sm },
  dayChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dayChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  dayChipOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.1)' },
  dayChipTxt: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
  dayChipTxtOn: { color: colors.gold },
  shipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    marginBottom: spacing.sm,
  },
  shipRowOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.06)' },
  shipTxt: { color: colors.textPrimary, fontWeight: '700' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  toggleLbl: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
  previewCard: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingBottom: spacing.lg,
  },
  previewImg: { width: '100%', height: 180, backgroundColor: '#111' },
  previewEyebrow: {
    ...typography.micro,
    color: colors.gold,
    letterSpacing: 0.8,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  previewTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '800', marginTop: spacing.xs, paddingHorizontal: spacing.lg },
  previewMeta: { color: colors.textSecondary, fontSize: 14, paddingHorizontal: spacing.lg, marginTop: 4 },
  previewTags: { color: colors.textMuted, fontSize: 12, paddingHorizontal: spacing.lg, marginTop: 6 },
  previewFee: { color: colors.textMuted, fontSize: 12, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  blockMuted: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  aiPriceCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  aiPriceK: { ...typography.micro, color: colors.gold, letterSpacing: 0.8 },
  aiPriceSuggested: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  aiPriceReason: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  aiPriceComps: { color: colors.textMuted, fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  aiPriceDisclaimer: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  aiPriceBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: 'center',
  },
  aiPriceBtnTxt: { color: colors.gold, fontWeight: '800', fontSize: 14 },
  aiShipCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(212,175,55,0.06)',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  aiShipK: { ...typography.micro, color: colors.gold, letterSpacing: 0.8 },
  aiShipTier: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  aiShipBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  blockK: { ...typography.micro, color: colors.gold, letterSpacing: 0.8, marginTop: spacing.md },
  blockBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  mobileShell: {
    alignSelf: 'center',
    width: 168,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#050505',
    paddingTop: 10,
    paddingHorizontal: 8,
    paddingBottom: 10,
    marginTop: spacing.sm,
  },
  mobileNotch: {
    alignSelf: 'center',
    width: 56,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 8,
  },
  mobileInner: {
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mobileThumb: { width: '100%', height: 100, backgroundColor: '#111' },
  mobileTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: '800', paddingHorizontal: spacing.sm, marginTop: spacing.sm },
  mobileMeta: { color: colors.textMuted, fontSize: 10, paddingHorizontal: spacing.sm, marginTop: 2 },
  mobilePrice: { color: colors.gold, fontSize: 13, fontWeight: '800', paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, marginTop: 4 },
  dual: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  draftBtn: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  draftTxt: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  pubBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
  },
  pubBtnOff: { opacity: 0.4 },
  pubTxt: { color: colors.background, fontWeight: '800', fontSize: 15 },
});
