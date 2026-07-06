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
import { useRef, useState, useCallback, useMemo } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  PublishListingError,
  newPublishRequestId,
  publishCreateListingForm,
} from '../../api/listingsPublishRepository';
import { fetchSellerConnectStatus } from '../../api/stripeConnectRepository';
import { useAuth } from '../../auth/AuthContext';
import { clearHomeFeedCache } from '../../lib/homeFeedCache';
import { usePlatformFee } from '../../platform/PlatformFeeContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { openSellerListingManagement } from '../../navigation/openSellerListingManagement';
import type { ListingPreview } from '../../createListing/types';
import { useCreateListingDraft } from '../../createListing/CreateListingDraftContext';
import {
  listingPricingAssistantEnabled,
  marketplaceListingAiEnabled,
} from '../../createListing/listingAiAssistantEnabled';
import { ListingPricingPayoutCard } from '../../createListing/ListingPricingPayoutCard';
import { resolvePricingItemPriceUsd } from '../../createListing/createListingReviewDisplay';
import {
  AUCTION_DURATION_DAY_OPTIONS,
  countListingPhotos,
  LISTING_CATEGORY_OPTIONS,
  LISTING_COMMERCE_OPTIONS,
  LISTING_MAX_PHOTOS,
  LISTING_MIN_PHOTOS,
  LIVE_INVENTORY_PHOTOS,
  listingHasVideo,
} from '../../createListing/types';
import { LISTING_CHANNEL_CONFIG } from '../../createListing/listingChannel';
import { getLiveProfile, liveShippingStepComplete } from '../../createListing/liveShowShipping';
import {
  isPackageDetailsComplete,
  marketplaceShippingListingReady,
} from '../../createListing/shippoRates';
import { useSellerShipFromZipPrefill } from '../../createListing/useSellerShipFromZipPrefill';
import type { CreateListingStackParamList } from '../../navigation/types';
import { CreateListingChrome } from './CreateListingChrome';
import { CreateListingFooter, WizardReviewBlock, wizardStyles } from './CreateListingWizardUI';
import { useSaveListingDraft } from './useSaveListingDraft';
import { useCreateListingFlow } from './createListingFlowHelpers';
import { useCreateListingNavigation } from './useCreateListingNavigation';
import {
  asListingString,
  getCreateListingReviewIssues,
  isLayawayPriceEligible,
  listingPhotoUri,
  listingSubcategories,
  resolveSellerDisplayPrice,
} from '../../createListing/createListingReviewDisplay';
import { colors, radii, spacing, typography } from '../../theme';

function Footer({
  accentPrimary,
  onBack,
  onNext,
  nextLabel,
  disabled,
}: {
  accentPrimary: string;
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  disabled?: boolean;
}) {
  const onSaveDraft = useSaveListingDraft();
  return (
    <CreateListingFooter
      accentPrimary={accentPrimary}
      onBack={onBack}
      onNext={onNext}
      nextLabel={nextLabel}
      disabled={disabled}
      onSaveDraft={onSaveDraft}
    />
  );
}

function feePreview(
  t: (typeof LISTING_COMMERCE_OPTIONS)[number]['id'] | null,
  platformFeePercent: number,
): string {
  const pct = platformFeePercent;
  switch (t) {
    case 'buy_now':
    case 'vault_drop':
      return `Est. success fee ${pct}% · Vaulted checkout included`;
    case 'auction':
    case 'live_auction':
      return `Hammer fee from ${pct}% · reserve holds optional`;
    case 'break_spot':
      return `Spot fee from ${pct}% · lane tooling included`;
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
  const { platformFeePercent, feeRateLabel } = usePlatformFee();
  const { channel, accent, totalSteps, isLiveShow, step } = useCreateListingFlow();
  const showPricingAssistant = listingPricingAssistantEnabled(isLiveShow);
  const { exitFlow, goBackStep } = useCreateListingNavigation();
  const t = form.listingType;
  const pricingItemPriceUsd = useMemo(() => resolvePricingItemPriceUsd(form), [
    form.buyNowPrice,
    form.startingBid,
    form.spotPrice,
    form.listingType,
  ]);
  const showPayoutEstimate = t !== 'trade_only' && pricingItemPriceUsd > 0;

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
            Timed auction — runs for the number of full days you select during the live show, then the highest bid wins.
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
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={wizardStyles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {showPricingAssistant && form.aiSuggestedPrice ? (
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
        {showPayoutEstimate ? (
          <ListingPricingPayoutCard
            itemPriceUsd={pricingItemPriceUsd}
            platformFeePercent={platformFeePercent}
            feeRateLabel={feeRateLabel}
          />
        ) : (
          <Text style={styles.fee}>{feePreview(t, platformFeePercent)}</Text>
        )}
      </ScrollView>
      <Footer
        accentPrimary={accent.primary}
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
        style={[wizardStyles.fieldInput, multiline && styles.inputMulti]}
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
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, disabled ? { opacity: 0.45 } : null]}>
      <Text style={styles.toggleLbl}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#333', true: 'rgba(212,175,55,0.45)' }}
        thumbColor={value ? colors.gold : '#888'}
      />
    </View>
  );
}

export function CreateListingReviewScreen({
  navigation,
}: NativeStackScreenProps<CreateListingStackParamList, 'CreateListingReview'>) {
  const { form, setForm, saveDraft, completeAfterPublish } = useCreateListingDraft();
  const { platformFeePercent, feeRateLabel } = usePlatformFee();
  const sellerShipFromZip = useSellerShipFromZipPrefill();
  const { session, user } = useAuth();
  const formForShipping = {
    ...form,
    shipFromZip: asListingString(form.shipFromZip).trim() || sellerShipFromZip || '',
    liveShipFromZip: asListingString(form.liveShipFromZip).trim() || sellerShipFromZip || '',
  };
  const [publishing, setPublishing] = useState(false);
  const publishLockRef = useRef(false);
  const publishRequestIdRef = useRef<string | null>(null);
  const { channel, accent, totalSteps, isLiveShow, step } = useCreateListingFlow();
  const showListingAi = marketplaceListingAiEnabled(isLiveShow);
  const showPricingAssistant = listingPricingAssistantEnabled(isLiveShow);
  const channelCfg = LISTING_CHANNEL_CONFIG[channel];
  const { exitFlow, goBackStep } = useCreateListingNavigation();
  const thumb = listingPhotoUri(form);
  const subcategories = listingSubcategories(form);
  const liveProfile = getLiveProfile(form.liveShippingProfileId);
  const typeLabel = LISTING_COMMERCE_OPTIONS.find((x) => x.id === form.listingType)?.label ?? 'Not provided';
  const catLabel = form.category
    ? (LISTING_CATEGORY_OPTIONS.find((c) => c.id === form.category)?.label ?? 'Not provided')
    : 'Not provided';
  const reviewStep = step.review;
  const photoCount = countListingPhotos(form.media ?? []);
  const reviewIssues = getCreateListingReviewIssues(form, { photoCount, isLiveShow });
  const requiredIssues = reviewIssues.filter((i) => i.severity === 'error');
  const photosValid = isLiveShow
    ? photoCount === LIVE_INVENTORY_PHOTOS
    : photoCount >= LISTING_MIN_PHOTOS && photoCount <= LISTING_MAX_PHOTOS;

  const aiReviewReasons = Array.isArray(form.aiReviewReasons) ? form.aiReviewReasons : [];
  const needsAck =
    showListingAi &&
    form.aiNeedsSellerConfirmation &&
    aiReviewReasons.length > 0 &&
    !form.aiAcknowledgedReviews;
  const needsMarketplaceShipping =
    !isLiveShow &&
    !marketplaceShippingListingReady(formForShipping) &&
    !(form.selectedShippoRate != null && isPackageDetailsComplete(formForShipping));
  const needsLiveShipping =
    isLiveShow &&
    !liveShippingStepComplete({
      liveShippingPreset: form.liveShippingPreset,
      liveShippingProfileId: form.liveShippingProfileId,
      liveShipFromZip: formForShipping.liveShipFromZip,
      liveBundleEligible: form.liveBundleEligible,
      liveAdvancedWeightLb: form.liveAdvancedWeightLb,
      liveAdvancedLengthIn: form.liveAdvancedLengthIn,
      liveAdvancedWidthIn: form.liveAdvancedWidthIn,
      liveAdvancedHeightIn: form.liveAdvancedHeightIn,
    });
  const canPublish = photosValid && !needsAck && !needsMarketplaceShipping && !needsLiveShipping;

  const verificationLine =
    form.verificationSource === 'visible_in_media'
      ? 'Authentication visible in uploaded imagery — buyers should confirm condition and authenticity.'
      : form.verificationSource === 'seller_provided'
        ? 'Seller-provided credentials — not independently verified by Get Vaulted.'
        : 'No authentication evidence highlighted in this listing.';

  const exitToActiveListing = useCallback(
    (listingId: string, preview: ListingPreview) => {
      void clearHomeFeedCache();
      publishRequestIdRef.current = null;
      navigation.getParent()?.goBack();
      requestAnimationFrame(() => {
        completeAfterPublish(preview);
        openSellerListingManagement(listingId);
      });
    },
    [completeAfterPublish, navigation],
  );

  const onPublish = async () => {
    if (publishLockRef.current || publishing) return;

    if (!photosValid) {
      Alert.alert(
        'Photos required',
        isLiveShow
          ? 'Upload 1 thumbnail image on the Upload step before publishing.'
          : photoCount < LISTING_MIN_PHOTOS
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

    if (listingHasVideo(form.media)) {
      const proceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Video not included',
          "Video attachments aren't supported yet and won't be included in your listing. Go back to the Upload step to remove it, or publish now with photos only.",
          [
            { text: 'Go back', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Publish without video', onPress: () => resolve(true) },
          ],
        );
      });
      if (!proceed) return;
    }

    if (!isSupabaseConfigured() || !user?.id) {
      Alert.alert('Sign in required', 'Sign in to publish listings to the vault.');
      return;
    }

    publishLockRef.current = true;
    setPublishing(true);

    const token = session?.access_token;
    if (token) {
      const { status: st } = await fetchSellerConnectStatus(token);
      if (st?.stripeConfigured && !st.can_publish_active_listings) {
        Alert.alert(
          'Finish payout setup',
          st.message_onboarding ?? 'Complete Stripe Connect under Seller HQ → Seller Payout Setup before publishing active listings or going live.',
        );
        publishLockRef.current = false;
        setPublishing(false);
        return;
      }
    }

    if (!publishRequestIdRef.current) {
      publishRequestIdRef.current = newPublishRequestId();
    }
    const publishRequestId = publishRequestIdRef.current;
    try {
      const { listingId, preview } = await publishCreateListingForm(user.id, form, { publishRequestId });
      exitToActiveListing(listingId, preview);
    } catch (e) {
      publishRequestIdRef.current = null;
      const message =
        e instanceof PublishListingError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not publish listing.';
      Alert.alert('Publish failed', message);
    } finally {
      publishLockRef.current = false;
      setPublishing(false);
    }
  };

  const onSaveDraft = () => {
    saveDraft();
    Alert.alert('Draft saved', 'Resume anytime from Seller Studio → Inventory.');
    navigation.getParent()?.goBack();
  };

  const sellerPrice = resolveSellerDisplayPrice(form);
  const reviewItemPriceUsd = useMemo(() => resolvePricingItemPriceUsd(form), [
    form.buyNowPrice,
    form.startingBid,
    form.spotPrice,
    form.listingType,
  ]);
  const showReviewPayoutEstimate =
    !isLiveShow && form.listingType !== 'trade_only' && reviewItemPriceUsd > 0;

  return (
    <CreateListingChrome
      step={reviewStep}
      total={totalSteps}
      channel={channel}
      title={isLiveShow ? 'Review & queue' : 'Review & publish'}
      subtitle={
        isLiveShow
          ? 'Confirm on-air placement before adding to your show inventory.'
          : 'Acquisition preview · marketplace discovery · final check before publish.'
      }
      onBack={goBackStep}
      onExit={exitFlow}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={wizardStyles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {requiredIssues.length > 0 ? (
          <View style={styles.reviewIssuesCard}>
            <Text style={styles.reviewIssuesTitle}>Complete these before publishing</Text>
            {requiredIssues.map((issue) => (
              <Pressable
                key={`${issue.screen}-${issue.message}`}
                style={styles.reviewIssueRow}
                onPress={() => navigation.navigate(issue.screen)}
              >
                <Text style={styles.reviewIssueTxt}>· {issue.message}</Text>
                <Text style={styles.reviewIssueLink}>Fix</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <LinearGradient colors={[accent.fill, '#0f0f0f']} style={styles.previewCard}>
          {thumb ? <Image source={{ uri: thumb }} style={styles.previewImg} resizeMode="cover" /> : null}
          <Text style={[styles.previewEyebrow, { color: accent.primary }]}>{channelCfg.shortLabel} preview</Text>
          <Text style={styles.previewTitle}>{asListingString(form.title).trim() || 'Untitled listing'}</Text>
          <Text style={styles.previewMeta}>
            {typeLabel} · {catLabel}
          </Text>
          {subcategories.length > 0 ? (
            <Text style={styles.previewTags}>Sub-categories: {subcategories.join(' · ')}</Text>
          ) : null}
          {isLiveShow && asListingString(form.liveShowTitle).trim() ? (
            <Text style={styles.previewTags}>Show: {asListingString(form.liveShowTitle).trim()}</Text>
          ) : null}
          {asListingString(form.tags).trim() ? (
            <Text style={styles.previewTags}>Tags: {asListingString(form.tags).trim()}</Text>
          ) : null}
          <Text style={styles.previewFee}>
            {showReviewPayoutEstimate
              ? `Get Vaulted success fee ${platformFeePercent}% · Vaulted checkout included`
              : feePreview(form.listingType, platformFeePercent)}
          </Text>
        </LinearGradient>

        <WizardReviewBlock title="Seller-confirmed economics">
          <Text style={wizardStyles.reviewLineStrong}>Your price: {sellerPrice}</Text>
          {showReviewPayoutEstimate ? (
            <ListingPricingPayoutCard
              itemPriceUsd={reviewItemPriceUsd}
              platformFeePercent={platformFeePercent}
              feeRateLabel={feeRateLabel}
            />
          ) : null}
          {showPricingAssistant && form.aiSuggestedPrice ? (
            <Text style={wizardStyles.reviewLineMuted}>AI suggested (reference only): {form.aiSuggestedPrice}</Text>
          ) : null}
        </WizardReviewBlock>

        <WizardReviewBlock title="Shipping & fees">
        {isLiveShow ? (
          <>
            <Text style={wizardStyles.reviewLine}>
              Live profile: {liveProfile?.label ?? '—'} · {form.liveShippingPreset === 'advanced' ? 'Advanced' : 'Simplified'}
            </Text>
            <Text style={wizardStyles.reviewLine}>
              Ship from: {asListingString(formForShipping.liveShipFromZip).trim() || '—'}
              {form.liveBundleEligible ? ' · Eligible for in-show bundling' : ' · Single-line shipping (not bundled)'}
            </Text>
            <Text style={wizardStyles.reviewLine}>
              {liveProfile && !liveProfile.internationalEligible
                ? 'Domestic only (profile)'
                : form.liveShipInternational
                  ? 'International buyers allowed'
                  : 'Domestic only'}
              {' '}
              · Shippo runs under the hood — buyers see tier-based bundles in the show, not marketplace rates.
            </Text>
            {asListingString(form.liveHandlingSurcharge).trim() ? (
              <Text style={wizardStyles.reviewLineMuted}>Handling surcharge: {asListingString(form.liveHandlingSurcharge).trim()}</Text>
            ) : null}
            {form.liveShippingPreset === 'advanced' ? (
              <Text style={wizardStyles.reviewLineMuted}>
                Adv. package: {asListingString(form.liveAdvancedWeightLb).trim() || '—'} lb ·{' '}
                {asListingString(form.liveAdvancedLengthIn).trim() || '—'}×
                {asListingString(form.liveAdvancedWidthIn).trim() || '—'}×
                {asListingString(form.liveAdvancedHeightIn).trim() || '—'} in
              </Text>
            ) : null}
          </>
        ) : marketplaceShippingListingReady(formForShipping) ||
          (form.selectedShippoRate != null && isPackageDetailsComplete(formForShipping)) ? (
          <>
            <Text style={wizardStyles.reviewLine}>
              Buyer-chosen delivery — checkout loads live Shippo quotes; the default is the best-value option. Faster
              options show when you allow them. You print the exact label and service the buyer paid for.
            </Text>
            <Text style={wizardStyles.reviewLine}>
              {form.marketplaceShippingOfferScope === 'all'
                ? 'You allow: all carrier services returned for this parcel.'
                : form.marketplaceShippingOfferScope === 'no_overnight'
                  ? 'You allow: economy & standard lanes (overnight-style services excluded).'
                  : `You allow: ${form.marketplaceOfferableRateCount} specific service(s).`}
            </Text>
            <Text style={wizardStyles.reviewLine}>
              Package lane · ship from {asListingString(formForShipping.shipFromZip).trim() || '—'}
              {form.marketplaceSellerShippingProfileId ? ' · saved shipping profile' : ''}
              {asListingString(form.shippingHandlingFee).trim()
                ? ` · Handling add-on ${asListingString(form.shippingHandlingFee).trim()}`
                : ''}
            </Text>
            <Text style={wizardStyles.reviewLineMuted}>
              {[
                formForShipping.packageWeightLb.trim() || formForShipping.packageWeightOz.trim()
                  ? `${formForShipping.packageWeightLb.trim() || '0'} lb ${formForShipping.packageWeightOz.trim() || '0'} oz`.replace(
                      /^0 lb 0 oz$/,
                      '',
                    )
                  : null,
                formForShipping.packageLengthIn.trim() &&
                formForShipping.packageWidthIn.trim() &&
                formForShipping.packageHeightIn.trim()
                  ? `${formForShipping.packageLengthIn}×${formForShipping.packageWidthIn}×${formForShipping.packageHeightIn} in`
                  : null,
              ]
                .filter((line) => line && line !== '0 lb 0 oz')
                .join(' · ')}
            </Text>
            <Text style={wizardStyles.reviewLineMuted}>
              {form.insurance ? 'Insurance available at label purchase · ' : ''}
              {form.signature ? 'Signature option · ' : ''}
              {form.international ? 'International quoting on' : 'Domestic benchmark lane'}
            </Text>
            <Text style={wizardStyles.reviewLineMuted}>Faster delivery options available at checkout.</Text>
          </>
        ) : (
          <Text style={wizardStyles.reviewLine}>
            Complete Shipping preferences — package details, rate preview, and at least one buyer-facing option.
          </Text>
        )}
        {!showReviewPayoutEstimate ? (
          <Text style={wizardStyles.reviewLineMuted}>{feePreview(form.listingType, platformFeePercent)}</Text>
        ) : null}
        </WizardReviewBlock>

        <WizardReviewBlock title="Verification status">
          <Text style={wizardStyles.reviewLine}>{verificationLine}</Text>
        </WizardReviewBlock>

        {showListingAi && form.aiNeedsSellerConfirmation ? (
          <WizardReviewBlock title="Needs seller confirmation">
            {aiReviewReasons.map((r) => (
              <Text key={r} style={wizardStyles.reviewLine}>
                · {asListingString(r)}
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
          </WizardReviewBlock>
        ) : null}

        <WizardReviewBlock title={isLiveShow ? 'Live placement' : 'Marketplace placement'}>
          <Text style={wizardStyles.reviewLine}>
            {isLiveShow
              ? 'Queued for your live show inventory — separate from marketplace listings.'
              : 'Listed in marketplace discovery — separate from live show inventory.'}
          </Text>
        </WizardReviewBlock>

        <Text style={styles.blockK}>Mobile preview</Text>
        <View style={styles.mobileShell}>
          <View style={styles.mobileNotch} />
          <View style={styles.mobileInner}>
            {thumb ? <Image source={{ uri: thumb }} style={styles.mobileThumb} resizeMode="cover" /> : null}
            <Text style={styles.mobileTitle} numberOfLines={2}>
              {asListingString(form.title).trim() || 'Untitled listing'}
            </Text>
            <Text style={styles.mobileMeta}>{typeLabel}</Text>
            <Text style={styles.mobilePrice}>{sellerPrice}</Text>
          </View>
        </View>

        <WizardReviewBlock title="Buyer actions">
        {!isLiveShow ? (
          <Toggle
            label="Accept offers"
            value={form.allowOffers}
            onValueChange={(v) => setForm({ allowOffers: v })}
          />
        ) : null}
        {!isLiveShow ? (
          <Toggle
            label="Allow layaway ($500+)"
            value={form.allowLayaway}
            onValueChange={(v) => setForm({ allowLayaway: v })}
            disabled={!isLayawayPriceEligible(form)}
          />
        ) : null}
        <Toggle label="Accept trade offers" value={form.acceptTrades} onValueChange={(v) => setForm({ acceptTrades: v })} />
        </WizardReviewBlock>

        <View style={styles.dual}>
          <Pressable style={styles.draftBtn} onPress={onSaveDraft}>
            <Text style={styles.draftTxt}>Save draft</Text>
          </Pressable>
          <Pressable
            style={[styles.pubBtn, { backgroundColor: accent.primary }, (!canPublish || publishing) && styles.pubBtnOff]}
            onPress={() => void onPublish()}
            disabled={!canPublish || publishing}
          >
            {publishing ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <>
                <Text style={styles.pubTxt}>Publish listing</Text>
                <Ionicons name="rocket-outline" size={18} color="#0a0a0a" />
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
  reviewIssuesCard: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    backgroundColor: 'rgba(127,29,29,0.2)',
    gap: spacing.sm,
  },
  reviewIssuesTitle: { color: '#fecaca', fontSize: 13, fontWeight: '800' },
  reviewIssueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reviewIssueTxt: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  reviewIssueLink: { color: colors.gold, fontWeight: '800', fontSize: 12 },
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
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  pubBtnOff: { opacity: 0.4, shadowOpacity: 0 },
  pubTxt: { color: '#0a0a0a', fontWeight: '800', fontSize: 15 },
});
