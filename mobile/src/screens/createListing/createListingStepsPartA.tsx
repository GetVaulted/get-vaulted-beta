import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import {
  pickPhotoFromCamera,
  pickSingleImageFromLibrary,
  promptPhotoPickSource,
} from '../../createListing/pickListingMedia';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCreateListingDraft } from '../../createListing/CreateListingDraftContext';
import { AiFieldBadge } from '../../createListing/AiFieldBadge';
import {
  LISTING_CATEGORY_OPTIONS,
  LISTING_COMMERCE_OPTIONS,
} from '../../createListing/types';
import { getSubcategoryGroups } from '../../createListing/listingCategoryTaxonomy';
import type { AiFieldConfidence, AiTrackedField, CreateListingFormState } from '../../createListing/types';
import {
  countListingPhotos,
  LISTING_MAX_PHOTOS,
  LISTING_MIN_PHOTOS,
  LIVE_INVENTORY_PHOTOS,
} from '../../createListing/types';
import { commerceOptionsForChannel } from '../../createListing/listingChannel';
import { marketplaceListingAiEnabled } from '../../createListing/listingAiAssistantEnabled';
import type { CreateListingStackParamList } from '../../navigation/types';
import { CreateListingChrome } from './CreateListingChrome';
import { CreateListingFooter, WizardInfoBanner, wizardStyles } from './CreateListingWizardUI';
import { useSaveListingDraft } from './useSaveListingDraft';
import { MarketplaceDraggableMediaList } from './MarketplaceDraggableMediaList';
import { useCreateListingFlow } from './createListingFlowHelpers';
import { useCreateListingNavigation } from './useCreateListingNavigation';
import { colors, radii, spacing, typography } from '../../theme';

function Footer({
  accentPrimary,
  onBack,
  onNext,
  nextLabel,
  backLabel = 'Back',
  disabled,
}: {
  accentPrimary: string;
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  backLabel?: string;
  disabled?: boolean;
}) {
  const onSaveDraft = useSaveListingDraft();
  return (
    <CreateListingFooter
      accentPrimary={accentPrimary}
      onBack={onBack}
      onNext={onNext}
      nextLabel={nextLabel}
      backLabel={backLabel}
      disabled={disabled}
      onSaveDraft={onSaveDraft}
    />
  );
}

export function CreateListingMediaScreen({
  navigation,
  route,
}: NativeStackScreenProps<CreateListingStackParamList, 'CreateListingMedia'>) {
  const { form, setForm, addMockPhoto, promptAddPhotos, removeMedia, setMediaOrder, startFresh, loadDraft, runAiMediaScan, beginListingChannel } =
    useCreateListingDraft();
  const { channel, accent, totalSteps, isLiveShow, step } = useCreateListingFlow();
  const showListingAi = marketplaceListingAiEnabled(isLiveShow);

  const photoCount = countListingPhotos(form.media);
  const minPhotos = isLiveShow ? LIVE_INVENTORY_PHOTOS : LISTING_MIN_PHOTOS;
  const maxPhotos = isLiveShow ? LIVE_INVENTORY_PHOTOS : LISTING_MAX_PHOTOS;
  const photosNeeded = Math.max(0, minPhotos - photoCount);
  const atPhotoMax = photoCount >= maxPhotos;
  const canContinue = isLiveShow ? photoCount === LIVE_INVENTORY_PHOTOS : photoCount >= LISTING_MIN_PHOTOS;

  const tryRemoveMedia = (id: string) => {
    const item = form.media.find((m) => m.id === id);
    if (!isLiveShow && item?.kind === 'photo' && photoCount <= LISTING_MIN_PHOTOS) {
      Alert.alert('Minimum photos', `Keep at least ${LISTING_MIN_PHOTOS} photos on your listing.`);
      return;
    }
    removeMedia(id);
  };

  const repickMedia = async (id: string, kind: 'photo' | 'video') => {
    let picked: ImagePicker.ImagePickerResult | null = null;

    if (kind === 'photo') {
      const source = await promptPhotoPickSource('Replace photo');
      if (!source) return;
      picked =
        source === 'camera' ? await pickPhotoFromCamera() : await pickSingleImageFromLibrary();
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photos', 'Allow photo library access to add listing media.');
        return;
      }
      picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsMultipleSelection: false,
        quality: 0.85,
      });
    }

    if (!picked || picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    const resolvedKind = asset.type === 'video' ? 'video' : 'photo';
    const target = form.media.find((m) => m.id === id);
    if (!isLiveShow && target?.kind === 'photo' && resolvedKind === 'video' && photoCount <= LISTING_MIN_PHOTOS) {
      Alert.alert('Minimum photos', `Keep at least ${LISTING_MIN_PHOTOS} photos before adding a video-only slot.`);
      return;
    }
    setForm({
      media: form.media.map((m) =>
        m.id === id
          ? {
              ...m,
              uri: asset.uri,
              kind: resolvedKind,
              label: resolvedKind === 'video' ? 'Video' : m.label,
            }
          : m
      ),
    });
  };

  useEffect(() => {
    if (route.params?.draftId) {
      loadDraft(route.params.draftId);
      return;
    }
    if (route.params?.channel && route.params?.reset) {
      beginListingChannel(route.params.channel);
      return;
    }
    if (route.params?.reset) {
      startFresh();
    }
  }, [route.params?.draftId, route.params?.channel, route.params?.reset, loadDraft, startFresh, beginListingChannel]);

  useEffect(() => {
    if (!route.params?.draftId && !form.listingChannel && navigation.isFocused()) {
      navigation.replace('CreateListingChooseChannel');
    }
  }, [form.listingChannel, navigation, route.params?.draftId]);

  const { exitFlow, goBackStep } = useCreateListingNavigation();

  return (
    <CreateListingChrome
      step={step.media}
      total={totalSteps}
      channel={channel}
      onBack={goBackStep}
      onExit={exitFlow}
      title={isLiveShow ? 'Upload show inventory' : 'Upload media'}
      subtitle={
        isLiveShow
          ? 'Single thumbnail for the live queue — shown on-air as the lot image.'
          : `Luxury listing gallery · ${LISTING_MIN_PHOTOS}–${LISTING_MAX_PHOTOS} photos (required). Optional video.`
      }
    >
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={wizardStyles.scroll}>
        {isLiveShow || showListingAi ? (
          <WizardInfoBanner accentPrimary={accent.primary} accentFill={accent.fill} accentBorder={accent.border}>
            Vault AI will review your media and suggest listing details when possible. You can edit everything before
            publishing.
          </WizardInfoBanner>
        ) : null}
        <View style={[wizardStyles.dropZone, { borderColor: accent.border }]}>
          <LinearGradient colors={accent.gradient} style={StyleSheet.absoluteFillObject} />
          <View style={[wizardStyles.optionIconWrap, { borderColor: accent.border, backgroundColor: accent.fill }]}>
            <Ionicons name="images-outline" size={22} color={accent.primary} />
          </View>
          <Text style={wizardStyles.dropTitle}>{isLiveShow ? 'Upload thumbnail' : 'Add photos & video'}</Text>
          <Text style={wizardStyles.dropSub}>
            {isLiveShow
              ? photoCount >= LIVE_INVENTORY_PHOTOS
                ? 'Thumbnail ready'
                : 'Upload 1 thumbnail image'
              : `${photoCount} of ${LISTING_MIN_PHOTOS}–${LISTING_MAX_PHOTOS} photos${
                  photosNeeded > 0 ? ` · ${photosNeeded} more required` : atPhotoMax ? ' · maximum reached' : ''
                }${!atPhotoMax ? ' · select multiple at once' : ''}`}
          </Text>
          {!atPhotoMax ? (
            <View style={wizardStyles.dropActions}>
              <Pressable
                style={[wizardStyles.dropActionBtn, { borderColor: accent.border }]}
                onPress={() => void promptAddPhotos()}
              >
                <Ionicons name="camera-outline" size={18} color={accent.primary} />
                <Text style={wizardStyles.dropActionTxt}>{isLiveShow ? 'Upload thumbnail' : 'Add photos'}</Text>
              </Pressable>
              {!isLiveShow ? (
                <Pressable
                  style={[wizardStyles.dropActionBtn, { borderColor: accent.border }]}
                  onPress={() => addMockPhoto('video')}
                >
                  <Ionicons name="videocam-outline" size={18} color={accent.primary} />
                  <Text style={wizardStyles.dropActionTxt}>Add video</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {!isLiveShow && form.media.length > 0 ? (
          <WizardInfoBanner accentPrimary={accent.primary} accentFill={accent.fill} accentBorder={accent.border} icon="hand-left-outline">
            To change the order, press and drag.
          </WizardInfoBanner>
        ) : null}

        {!isLiveShow && form.media.length > 0 ? (
          <MarketplaceDraggableMediaList
            media={form.media}
            accentPrimary={accent.primary}
            onReorder={setMediaOrder}
            onRepick={repickMedia}
            onRemove={tryRemoveMedia}
          />
        ) : (
          form.media.map((m) => (
            <View key={m.id} style={styles.mediaCard}>
              <Image source={{ uri: m.uri }} style={styles.mediaImg} resizeMode="cover" />
              <View style={styles.mediaBody}>
                <Text style={styles.mediaCap}>{m.label}</Text>
                <Text style={styles.mediaKind}>{m.kind === 'video' ? 'Video' : 'Photo'}</Text>
                <View style={styles.mediaRow}>
                  <Pressable onPress={() => void repickMedia(m.id, m.kind === 'video' ? 'video' : 'photo')}>
                    <Text style={styles.link}>{isLiveShow ? 'Replace thumbnail' : 'Replace photo'}</Text>
                  </Pressable>
                  <Pressable onPress={() => tryRemoveMedia(m.id)}>
                    <Text style={styles.linkDanger}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <Footer
        accentPrimary={accent.primary}
        onBack={goBackStep}
        backLabel="Back"
        onNext={() => {
          navigation.navigate('CreateListingType');
          if (showListingAi) void runAiMediaScan();
        }}
        nextLabel="Continue"
        disabled={!canContinue}
      />
    </CreateListingChrome>
  );
}

export function CreateListingTypeScreen({
  navigation,
}: NativeStackScreenProps<CreateListingStackParamList, 'CreateListingType'>) {
  const { form, setForm } = useCreateListingDraft();
  const { channel, accent, totalSteps, isLiveShow, step } = useCreateListingFlow();
  const showListingAi = marketplaceListingAiEnabled(isLiveShow);
  const { exitFlow, goBackStep } = useCreateListingNavigation();
  const rec = form.aiListingTypeRecommendation;
  const recLabel = rec ? LISTING_COMMERCE_OPTIONS.find((o) => o.id === rec)?.label : null;
  const allowedIds = new Set(commerceOptionsForChannel(channel));
  const commerceOptions = LISTING_COMMERCE_OPTIONS.filter((o) => allowedIds.has(o.id));
  return (
    <CreateListingChrome
      step={step.type}
      total={totalSteps}
      channel={channel}
      title={isLiveShow ? 'Live sale format' : 'Listing type'}
      subtitle={
        isLiveShow
          ? 'Auction, break, or drop lanes — optimized for on-air velocity.'
          : 'Buy now or trade — built for vault discovery, offers, and trades.'
      }
      onBack={goBackStep}
      onExit={exitFlow}
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={wizardStyles.scroll}>
        {showListingAi && form.aiScanCompleted && !(rec && recLabel) ? (
          <View style={styles.aiAssistBanner}>
            <Ionicons name="sparkles-outline" size={18} color={colors.gold} />
            <Text style={styles.aiAssistBannerText}>
              No lane suggestion from your media yet — choose any listing type below. You can edit everything before
              publishing.
            </Text>
          </View>
        ) : null}
        {showListingAi && rec && recLabel ? (
          <View style={styles.aiBanner}>
            <Text style={styles.aiBannerK}>Optional AI lane suggestion</Text>
            <Text style={styles.aiBannerBody}>
              Vault AI suggests <Text style={styles.aiEm}>{recLabel}</Text>. Tap apply or pick another lane.
            </Text>
            <Pressable
              style={styles.aiApply}
              onPress={() =>
                setForm({
                  listingType: rec,
                  aiFieldBadges: { ...form.aiFieldBadges, listingType: 'confirmed' },
                })
              }
            >
              <Text style={styles.aiApplyTxt}>Apply AI suggestion</Text>
            </Pressable>
          </View>
        ) : null}
        {commerceOptions.map((opt) => {
          const on = form.listingType === opt.id;
          return (
            <Pressable
              key={opt.id}
              style={[
                wizardStyles.optionCard,
                on && wizardStyles.optionCardSelected,
                on && { borderColor: accent.border, backgroundColor: accent.fill },
              ]}
              onPress={() =>
                setForm({
                  listingType: opt.id,
                  aiFieldBadges: { ...form.aiFieldBadges, listingType: 'confirmed' },
                })
              }
            >
              <View style={[wizardStyles.optionIconWrap, { borderColor: accent.border, backgroundColor: accent.fill }]}>
                <Ionicons name={opt.icon} size={20} color={on ? accent.primary : colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={wizardStyles.optionTitle}>{opt.label}</Text>
                <Text style={wizardStyles.optionSub}>{opt.sub}</Text>
              </View>
              <Ionicons
                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={on ? accent.primary : colors.textMuted}
              />
            </Pressable>
          );
        })}
      </ScrollView>
      <Footer
        accentPrimary={accent.primary}
        onBack={() => navigation.goBack()}
        onNext={() => {
          if (!form.listingType) return;
          navigation.navigate('CreateListingCategory');
        }}
        nextLabel="Continue"
        disabled={!form.listingType}
      />
    </CreateListingChrome>
  );
}

export function CreateListingCategoryScreen({
  navigation,
}: NativeStackScreenProps<CreateListingStackParamList, 'CreateListingCategory'>) {
  const { form, setForm } = useCreateListingDraft();
  const { channel, accent, totalSteps, isLiveShow, step } = useCreateListingFlow();
  const { exitFlow, goBackStep } = useCreateListingNavigation();
  const subGroups = form.category ? getSubcategoryGroups(form.category) : [];

  const toggleSubcategory = (label: string) => {
    const selected = form.subcategories.includes(label);
    const next = selected ? form.subcategories.filter((s) => s !== label) : [...form.subcategories, label];
    setForm({
      subcategories: next,
      aiFieldBadges: { ...form.aiFieldBadges, subcategory: 'confirmed' },
    });
  };

  return (
    <CreateListingChrome
      step={step.category}
      total={totalSteps}
      channel={channel}
      title="Category"
      subtitle={
        isLiveShow
          ? 'Pick a category, then tag all sub-categories that apply.'
          : 'Choose a category, then select every sub-category that fits — multiple selections allowed.'
      }
      onBack={goBackStep}
      onExit={exitFlow}
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={wizardStyles.scroll}>
        {LISTING_CATEGORY_OPTIONS.map((c) => {
          const on = form.category === c.id;
          return (
            <Pressable
              key={c.id}
              style={[
                wizardStyles.optionCard,
                on && wizardStyles.optionCardSelected,
                on && { borderColor: accent.border, backgroundColor: accent.fill },
              ]}
              onPress={() =>
                setForm({
                  category: c.id,
                  subcategories: form.category === c.id ? form.subcategories : [],
                  aiFieldBadges: { ...form.aiFieldBadges, category: 'confirmed' },
                })
              }
            >
              <Text style={[wizardStyles.optionTitle, { flex: 1 }]}>{c.label}</Text>
              <Ionicons name={on ? 'checkmark-circle' : 'chevron-forward'} size={22} color={on ? accent.primary : colors.textMuted} />
            </Pressable>
          );
        })}
        {form.category === 'luxury' ? (
          <View style={[styles.catGuidance, { borderColor: accent.border, backgroundColor: accent.fill }]}>
            <Ionicons name="information-circle-outline" size={18} color={accent.primary} />
            <Text style={styles.catGuidanceText}>
              Wristwatches and timepieces belong in the main <Text style={styles.catGuidanceEm}>Watches</Text> category —
              not under Luxury.
            </Text>
          </View>
        ) : null}
        {form.category === 'other' ? (
          <View style={[styles.catGuidance, { borderColor: accent.border, backgroundColor: accent.fill }]}>
            <Ionicons name="information-circle-outline" size={18} color={accent.primary} />
            <Text style={styles.catGuidanceText}>
              Use <Text style={styles.catGuidanceEm}>Other</Text> for electronics, art, hobbies, and anything not covered
              by our specialty categories — a home for new sellers and mixed inventory.
            </Text>
          </View>
        ) : null}
        {form.category && subGroups.length > 0 ? (
          <>
            <View style={styles.subHeaderRow}>
              <Text style={styles.subK}>Sub-categories</Text>
              <Text style={styles.subHint}>Select all that apply</Text>
            </View>
            {form.subcategories.length > 0 ? (
              <Text style={styles.subSelectedCount}>{form.subcategories.length} selected</Text>
            ) : null}
            {subGroups.map((group) => (
              <View key={group.title} style={styles.subGroup}>
                <Text style={styles.subGroupTitle}>{group.title}</Text>
                <View style={styles.subWrap}>
                  {group.options.map((s) => {
                    const on = form.subcategories.includes(s);
                    return (
                      <Pressable
                        key={s}
                        style={[
                          styles.subChip,
                          on && styles.subChipOn,
                          on && { borderColor: accent.border, backgroundColor: accent.fill },
                        ]}
                        onPress={() => toggleSubcategory(s)}
                      >
                        {on ? (
                          <Ionicons name="checkmark-circle" size={14} color={accent.primary} style={styles.subCheck} />
                        ) : null}
                        <Text style={[styles.subChipTxt, on && styles.subChipTxtOn, on && { color: accent.primary }]}>
                          {s}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
      <Footer
        accentPrimary={accent.primary}
        onBack={() => navigation.goBack()}
        onNext={() => {
          if (!form.category) return;
          navigation.navigate('CreateListingDetails');
        }}
        nextLabel="Continue"
        disabled={!form.category}
      />
    </CreateListingChrome>
  );
}

/** Module-level so TextInputs are not remounted on every keystroke (nested components lose focus). */
function ListingDetailsField({
  label,
  aiBadge,
  onConfirmAi,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  aiBadge?: AiFieldConfidence;
  onConfirmAi?: () => void;
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldHead}>
        <Text style={styles.fieldLbl}>{label}</Text>
        {aiBadge ? <AiFieldBadge status={aiBadge} /> : null}
      </View>
      {aiBadge === 'needs_review' && onConfirmAi ? (
        <Pressable style={styles.confirmRow} onPress={onConfirmAi}>
          <Text style={styles.link}>Mark as confirmed</Text>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.gold} />
        </Pressable>
      ) : null}
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

export function CreateListingDetailsScreen({
  navigation,
}: NativeStackScreenProps<CreateListingStackParamList, 'CreateListingDetails'>) {
  const { form, setForm, confirmAiField } = useCreateListingDraft();
  const { channel, accent, totalSteps, isLiveShow, step } = useCreateListingFlow();
  const showListingAi = marketplaceListingAiEnabled(isLiveShow);
  const { exitFlow, goBackStep } = useCreateListingNavigation();

  const mark = (key: AiTrackedField, text: string) =>
    setForm({
      [key]: text,
      aiFieldBadges: { ...form.aiFieldBadges, [key]: 'confirmed' },
    } as Partial<CreateListingFormState>);

  return (
    <CreateListingChrome
      step={step.details}
      total={totalSteps}
      channel={channel}
      title={isLiveShow ? 'Queue item details' : 'Listing details'}
      subtitle={
        isLiveShow
          ? 'Short spec for the live queue — buyers see this on-air.'
          : 'Modular fields — premium spec sheet, not a spreadsheet.'
      }
      onBack={goBackStep}
      onExit={exitFlow}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={wizardStyles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {isLiveShow ? (
          <>
            <ListingDetailsField
              label="Show / queue name (optional)"
              value={form.liveShowTitle}
              onChange={(t) => setForm({ liveShowTitle: t })}
              placeholder="Friday Night Breaks"
            />
            <ListingDetailsField
              label="Queue notes"
              value={form.queueNotes}
              onChange={(t) => setForm({ queueNotes: t })}
              placeholder="Lot order, bundle rules, sudden death…"
              multiline
            />
          </>
        ) : null}
        {showListingAi && form.aiNeedsSellerConfirmation ? (
          <View style={styles.warnBanner}>
            <Ionicons name="alert-circle-outline" size={20} color="#FFB340" />
            <View style={{ flex: 1 }}>
              <Text style={styles.warnTitle}>Needs seller confirmation</Text>
              {form.aiReviewReasons.map((r) => (
                <Text key={r} style={styles.warnLine}>
                  · {r}
                </Text>
              ))}
            </View>
          </View>
        ) : null}
        <ListingDetailsField
          label="Title"
          aiBadge={showListingAi ? form.aiFieldBadges.title : undefined}
          onConfirmAi={showListingAi ? () => confirmAiField('title') : undefined}
          value={form.title}
          onChange={(t) => mark('title', t)}
          placeholder="What is this acquisition?"
        />
        <ListingDetailsField
          label="Description"
          aiBadge={showListingAi ? form.aiFieldBadges.description : undefined}
          onConfirmAi={showListingAi ? () => confirmAiField('description') : undefined}
          value={form.description}
          onChange={(t) => mark('description', t)}
          placeholder="Story, context, why it matters…"
          multiline
        />
        <ListingDetailsField
          label="Condition"
          aiBadge={showListingAi ? form.aiFieldBadges.condition : undefined}
          onConfirmAi={showListingAi ? () => confirmAiField('condition') : undefined}
          value={form.condition}
          onChange={(t) => mark('condition', t)}
          placeholder="e.g. Unworn · PSA 10 · hairline case"
        />
        <ListingDetailsField
          label="Authentication"
          aiBadge={showListingAi ? form.aiFieldBadges.authentication : undefined}
          onConfirmAi={showListingAi ? () => confirmAiField('authentication') : undefined}
          value={form.authentication}
          onChange={(t) => mark('authentication', t)}
          placeholder="Visible labels only — never claim guaranteed authenticity without Vaulted verification."
        />
        <ListingDetailsField
          label="Brand / set / player"
          aiBadge={showListingAi ? form.aiFieldBadges.brand : undefined}
          onConfirmAi={showListingAi ? () => confirmAiField('brand') : undefined}
          value={form.brand}
          onChange={(t) => mark('brand', t)}
          placeholder="Brand, set, or player line"
        />
        <ListingDetailsField
          label="Reference #"
          aiBadge={showListingAi ? form.aiFieldBadges.referenceNumber : undefined}
          onConfirmAi={showListingAi ? () => confirmAiField('referenceNumber') : undefined}
          value={form.referenceNumber}
          onChange={(t) => mark('referenceNumber', t)}
          placeholder="SKU, ref, cert #"
        />
        <ListingDetailsField
          label="Year"
          aiBadge={showListingAi ? form.aiFieldBadges.year : undefined}
          onConfirmAi={showListingAi ? () => confirmAiField('year') : undefined}
          value={form.year}
          onChange={(t) => mark('year', t)}
          placeholder="Year or era"
        />
        <ListingDetailsField
          label="Grade"
          aiBadge={showListingAi ? form.aiFieldBadges.grade : undefined}
          onConfirmAi={showListingAi ? () => confirmAiField('grade') : undefined}
          value={form.grade}
          onChange={(t) => mark('grade', t)}
          placeholder="Grade or N/A"
        />
        {!isLiveShow ? (
          <ListingDetailsField
            label="Tags"
            aiBadge={showListingAi ? form.aiFieldBadges.tags : undefined}
            onConfirmAi={showListingAi ? () => confirmAiField('tags') : undefined}
            value={form.tags}
            onChange={(t) => mark('tags', t)}
            placeholder="Comma-separated discovery tags"
          />
        ) : null}
        {!isLiveShow ? (
          <>
            <ListingDetailsField
              label="Included accessories"
              value={form.accessories}
              onChange={(t) => setForm({ accessories: t })}
              placeholder="Box, papers, extras"
            />
            <ListingDetailsField
              label="Shipping notes"
              value={form.shippingNotes}
              onChange={(t) => setForm({ shippingNotes: t })}
              placeholder="White-glove, split ship, etc."
              multiline
            />
          </>
        ) : null}
      </ScrollView>
      <Footer
        accentPrimary={accent.primary}
        onBack={() => navigation.goBack()}
        onNext={() => navigation.navigate('CreateListingPricing')}
        nextLabel="Continue"
        disabled={!form.title.trim()}
      />
    </CreateListingChrome>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl, gap: spacing.md },
  dropZone: {
    minHeight: 160,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  dropTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  dropSub: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  dropActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  addTxt: { color: colors.textPrimary, fontWeight: '700' },
  addBtnDisabled: { opacity: 0.45 },
  addTxtDisabled: { color: colors.textMuted },
  mediaCard: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  mediaImg: { width: 88, height: 88, borderRadius: radii.md, backgroundColor: colors.surface },
  mediaBody: { flex: 1, gap: 4 },
  mediaCap: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  mediaKind: { color: colors.textMuted, fontSize: 12 },
  mediaRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  link: { color: colors.gold, fontWeight: '700', fontSize: 13 },
  linkDanger: { color: colors.live, fontWeight: '700', fontSize: 13 },
  reorderNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  reorderNoteText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeCardOn: { borderColor: colors.borderStrong, backgroundColor: 'rgba(212,175,55,0.06)' },
  typeTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  typeSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  catCardOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.06)' },
  catTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  catGuidance: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  catGuidanceText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  catGuidanceEm: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  subK: { ...typography.micro, color: colors.textMuted },
  subHint: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  subSelectedCount: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  subGroup: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  subGroupTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  subWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  subCheck: { marginRight: 2 },
  subChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  subChipOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.1)' },
  subChipTxt: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  subChipTxtOn: { color: colors.gold },
  fieldBlock: { gap: spacing.xs },
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
  aiAssistBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.28)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  aiAssistBannerText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  aiBanner: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
    gap: spacing.sm,
  },
  aiBannerK: { ...typography.micro, color: colors.gold, letterSpacing: 0.8 },
  aiBannerBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  aiEm: { color: colors.textPrimary, fontWeight: '800' },
  aiApply: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
  },
  aiApplyTxt: { color: colors.background, fontWeight: '800', fontSize: 13 },
  warnBanner: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.35)',
    backgroundColor: 'rgba(255,149,0,0.08)',
  },
  warnTitle: { color: '#FFB340', fontWeight: '800', fontSize: 14, marginBottom: 4 },
  warnLine: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
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
  inputMulti: { minHeight: 100, textAlignVertical: 'top' },
});
