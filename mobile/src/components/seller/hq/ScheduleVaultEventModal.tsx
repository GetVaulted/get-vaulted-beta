import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchSellerShippingProfiles, type LiveHostShippingProfileOption } from '../../../api/liveHostShippingRepository';
import { resolveSellerShippingProfileIdForCategory } from '../../../lib/liveShowCategoryShippingProfile';
import { createLiveRoom, streamFormatToRoomType } from '../../../api/liveRoomsRepository';
import { fetchSellerLiveReadiness, type SellerLiveReadiness } from '../../../api/liveHostRepository';
import { logVaultCommandCenter, supabaseJwtSub } from '../../../lib/logVaultCommandCenterFlow';
import { resolveSellerAccessToken } from '../../../lib/resolveSellerAccessToken';
import { navigateAuthLogin } from '../../../navigation/rootNavigationRef';
import { uploadListingImageViaWeb } from '../../../api/webListingsRepository';
import { uploadLiveTeaserToSupabase } from '../../../api/liveTeaserRepository';
import {
  LIVE_TEASER_MAX_BYTES,
  LIVE_TEASER_MAX_DURATION_MS,
  LIVE_TEASER_MIN_DURATION_MS,
} from '../../../lib/liveTeaserLimits';
import {
  alignScheduleToQuarterHour,
  isQuarterHourSchedule,
  type BreakPricingMode,
  type CreateScheduleMode,
} from '../../../lib/createLiveRoomPayload';
import { CreateVaultEventReadinessChecklist } from './CreateVaultEventReadinessChecklist';
import { LiveShowTipModeratorFields } from './LiveShowTipModeratorFields';
import { notifyLiveDiscoveryChanged } from '../../../lib/notifyLiveDiscoveryChanged';
import type { LiveSalesGate } from '../../../lib/sellerLiveReadiness';
import { VAULT_EVENT_CATEGORY_OPTIONS } from '../../../lib/liveRoomDisplay';
import { isTabletLiveRoomLayout } from '../../../lib/liveRoomUiScale';
import { colors, radii, spacing } from '../../../theme';

const THUMBNAIL_MAX_BYTES = 20 * 1024 * 1024;

function defaultScheduledDate(): Date {
  return alignScheduleToQuarterHour(new Date(Date.now() + 60 * 60 * 1000));
}

function formatScheduledDate(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const BREAK_PRICING_MODES: { id: BreakPricingMode; label: string }[] = [
  { id: 'fixed', label: 'Fixed price' },
  { id: 'auction', label: 'Auction spots' },
  { id: 'hybrid', label: 'Hybrid' },
];

const FORMATS: { id: 'auction' | 'break' | 'hybrid'; label: string }[] = [
  { id: 'break', label: 'Break' },
  { id: 'auction', label: 'Auction' },
  { id: 'hybrid', label: 'Buy now' },
];

export function ScheduleVaultEventModal({
  visible,
  onClose,
  accessToken,
  liveGate,
  readiness,
  readinessLoading,
  onRefreshReadiness,
  onFixReadiness,
  scheduleTitle,
  setScheduleTitle,
  scheduleCategory,
  setScheduleCategory,
  streamFormat,
  setStreamFormat,
  onCreated,
  onScheduled,
}: {
  visible: boolean;
  onClose: () => void;
  accessToken?: string;
  liveGate: LiveSalesGate;
  readiness: SellerLiveReadiness | null;
  readinessLoading: boolean;
  onRefreshReadiness?: () => void;
  onFixReadiness?: (step: 'stripe' | 'ship_from') => void;
  scheduleTitle: string;
  setScheduleTitle: (s: string) => void;
  scheduleCategory: string;
  setScheduleCategory: (label: string) => void;
  streamFormat: 'auction' | 'break' | 'hybrid';
  setStreamFormat: (f: 'auction' | 'break' | 'hybrid') => void;
  onCreated: (roomId: string) => void;
  onScheduled?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = isTabletLiveRoomLayout(windowWidth);
  const thumbPreviewSize = useMemo(
    () =>
      isTablet
        ? { maxWidth: Math.min(520, Math.round(windowWidth * 0.52)), height: 200 }
        : { maxWidth: 320, height: 180 },
    [isTablet, windowWidth],
  );
  const [tagline, setTagline] = useState('');
  const [scheduleMode, setScheduleMode] = useState<CreateScheduleMode>('now');
  const [scheduledDate, setScheduledDate] = useState(defaultScheduledDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  /** Android cannot use mode="datetime" — open time after date. */
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState('');
  const [teaserUrl, setTeaserUrl] = useState('');
  const [teaserDurationMs, setTeaserDurationMs] = useState<number | null>(null);
  const [teaserUploading, setTeaserUploading] = useState(false);
  const [teaserError, setTeaserError] = useState<string | null>(null);
  const [thumbUploading, setThumbUploading] = useState(false);
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [breakPricingMode, setBreakPricingMode] = useState<BreakPricingMode>('auction');
  const [breakSpotPrice, setBreakSpotPrice] = useState('');
  const [teamBoardEnabled, setTeamBoardEnabled] = useState(true);
  const [tipModeratorId, setTipModeratorId] = useState<string | null>(null);
  const [tipModeratorUsername, setTipModeratorUsername] = useState('');
  const [tipsToModerator, setTipsToModerator] = useState(false);
  const [recurringWeekly, setRecurringWeekly] = useState(false);
  const [discoveryVisibility, setDiscoveryVisibility] = useState<'public' | 'private'>('public');
  const [shippingProfiles, setShippingProfiles] = useState<LiveHostShippingProfileOption[]>([]);
  const [defaultSellerShippingProfileId, setDefaultSellerShippingProfileId] = useState('');
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesLoadError, setProfilesLoadError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const onRefreshReadinessRef = useRef(onRefreshReadiness);
  onRefreshReadinessRef.current = onRefreshReadiness;

  const titleComplete = scheduleTitle.trim().length > 0;
  const readinessOk = readiness?.canGoLive === true;
  const readinessKnown = readiness !== null;
  const liveBlocked = liveGate.blocked || !readinessKnown || !readinessOk;
  const isBreak = streamFormat === 'break';
  const shippingProfileReady =
    !profilesLoading && shippingProfiles.length > 0 && defaultSellerShippingProfileId.trim().length > 0;
  const createBlocked = liveBlocked || !titleComplete || profilesLoading || !shippingProfileReady;

  const loadShippingProfiles = useCallback(async () => {
    setProfilesLoading(true);
    setProfilesLoadError(null);
    try {
      const token = await resolveSellerAccessToken(accessToken ?? undefined);
      const profiles = await fetchSellerShippingProfiles(token);
      setShippingProfiles(profiles);
      if (profiles.length === 0) {
        setDefaultSellerShippingProfileId('');
        setProfilesLoadError('Could not load shipping profiles. Tap Retry or open Seller Studio on desktop.');
        return;
      }
      setProfilesLoadError(null);
    } catch (e) {
      setShippingProfiles([]);
      setDefaultSellerShippingProfileId('');
      setProfilesLoadError(e instanceof Error ? e.message : 'Could not load shipping profiles.');
    } finally {
      setProfilesLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!visible) return;
    setSubmitError(null);
    void onRefreshReadinessRef.current?.();
    void loadShippingProfiles();
  }, [visible, loadShippingProfiles]);

  useEffect(() => {
    if (!visible || shippingProfiles.length === 0) return;
    const profileId = resolveSellerShippingProfileIdForCategory(
      shippingProfiles.map((p) => ({
        id: p.id,
        sourceSlug: p.sourceSlug ?? '',
        isDefault: p.isDefault,
      })),
      scheduleCategory,
    );
    if (profileId) setDefaultSellerShippingProfileId(profileId);
  }, [scheduleCategory, shippingProfiles, visible]);

  const resetThumb = useCallback(() => {
    setThumbUrl('');
    setThumbError(null);
  }, []);

  const pickThumbnail = useCallback(async () => {
    if (!accessToken) {
      Alert.alert('Sign in required', 'Sign in to upload a cover image.');
      return;
    }
    setThumbError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos access needed', 'Allow photo library access to upload a cover image.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.86,
    });
    if (picked.canceled || !picked.assets[0]?.uri) return;
    const asset = picked.assets[0];
    if (asset.fileSize && asset.fileSize > THUMBNAIL_MAX_BYTES) {
      setThumbError('Cover image must be 20MB or smaller.');
      return;
    }
    setThumbUploading(true);
    try {
      const url = await uploadListingImageViaWeb(accessToken, asset.uri);
      setThumbUrl(url);
    } catch (e) {
      setThumbError(e instanceof Error ? e.message : 'Could not upload cover image.');
    } finally {
      setThumbUploading(false);
    }
  }, [accessToken]);

  const pickTeaser = useCallback(async () => {
    if (!accessToken) {
      Alert.alert('Sign in required', 'Sign in to upload a preview video.');
      return;
    }
    setTeaserError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos access needed', 'Allow photo library access to upload a preview video.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      videoMaxDuration: Math.ceil(LIVE_TEASER_MAX_DURATION_MS / 1000),
      quality: 1,
    });
    if (picked.canceled || !picked.assets[0]?.uri) return;
    const asset = picked.assets[0];
    const rawDuration = typeof asset.duration === 'number' && Number.isFinite(asset.duration) ? asset.duration : null;
    if (rawDuration == null || rawDuration <= 0) {
      setTeaserError('Could not read video length. Try another clip.');
      return;
    }
    // expo-image-picker usually reports seconds; treat values ≤120 as seconds, otherwise ms.
    const normalizedMs = Math.round(rawDuration <= 120 ? rawDuration * 1000 : rawDuration);
    if (normalizedMs < LIVE_TEASER_MIN_DURATION_MS || normalizedMs > LIVE_TEASER_MAX_DURATION_MS) {
      setTeaserError('Preview video must be between 1 and 15 seconds.');
      return;
    }
    if (asset.fileSize && asset.fileSize > LIVE_TEASER_MAX_BYTES) {
      setTeaserError('Preview video must be 40MB or smaller.');
      return;
    }
    const sellerId = supabaseJwtSub(accessToken);
    if (!sellerId) {
      setTeaserError('Sign in again to upload a preview video.');
      return;
    }
    setTeaserUploading(true);
    try {
      const uploaded = await uploadLiveTeaserToSupabase(sellerId, asset.uri, normalizedMs);
      setTeaserUrl(uploaded.url);
      setTeaserDurationMs(uploaded.durationMs);
    } catch (e) {
      setTeaserError(e instanceof Error ? e.message : 'Could not upload preview video.');
    } finally {
      setTeaserUploading(false);
    }
  }, [accessToken]);

  const resetForm = useCallback(() => {
    setScheduleTitle('');
    setTagline('');
    setScheduleMode('now');
    setScheduledDate(defaultScheduledDate());
    setShowDatePicker(false);
    setShowTimePicker(false);
    setThumbUrl('');
    setThumbError(null);
    setTeaserUrl('');
    setTeaserDurationMs(null);
    setTeaserError(null);
    setBreakPricingMode('auction');
    setBreakSpotPrice('');
    setTeamBoardEnabled(true);
    setTipModeratorId(null);
    setTipModeratorUsername('');
    setTipsToModerator(false);
    setRecurringWeekly(false);
    setDiscoveryVisibility('public');
    setStreamFormat('hybrid');
    setScheduleCategory('Cards');
  }, [setScheduleCategory, setScheduleTitle, setStreamFormat]);

  const submit = useCallback(async () => {
    if (submittingRef.current || busy) return;
    if (liveGate.blocked) {
      Alert.alert(liveGate.alertTitle, liveGate.alertBody);
      return;
    }
    let token: string;
    try {
      token = await resolveSellerAccessToken(accessToken);
    } catch {
      Alert.alert('Sign in required', 'Sign in to create a vault event.');
      return;
    }

    let freshReadiness: SellerLiveReadiness | null = null;
    try {
      freshReadiness = await fetchSellerLiveReadiness(token);
      const sessionSub = supabaseJwtSub(token);
      logVaultCommandCenter('create_preflight_readiness', {
        canGoLive: freshReadiness.canGoLive,
        issueCount: freshReadiness.issues.length,
        sessionSub,
        sellerId: freshReadiness.sellerUserId ?? null,
        userId: freshReadiness.sellerUserId ?? sessionSub,
        sessionSellerMismatch: Boolean(
          sessionSub && freshReadiness.sellerUserId && sessionSub !== freshReadiness.sellerUserId,
        ),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not verify go-live readiness.';
      setSubmitError(msg);
      Alert.alert('Setup check failed', msg);
      return;
    }
    if (!freshReadiness.canGoLive) {
      const body =
        freshReadiness.issues.filter((i) => i.trim().length > 0).join('\n\n') ||
        'Finish payout and shipping setup before creating a show.';
      setSubmitError(body);
      Alert.alert('Complete setup first', body);
      return;
    }
    const title = scheduleTitle.trim();
    if (!title) {
      Alert.alert('Title required', 'Name your vault event before continuing.');
      return;
    }
    if (!defaultSellerShippingProfileId.trim()) {
      if (shippingProfiles.length === 0) {
        Alert.alert(
          'Shipping profiles unavailable',
          profilesLoadError ??
            'Your shipping profiles did not load. Scroll to Default shipping profile and tap Retry.',
        );
      } else {
        Alert.alert('Shipping profile', 'Select the shipping profile for this show.');
      }
      return;
    }
    if (thumbUploading) return;

    let scheduledStartAt: string | undefined;
    if (scheduleMode === 'later') {
      if (scheduledDate.getTime() < Date.now() + 60_000) {
        Alert.alert('Pick a future time', 'Schedule at least one minute from now.');
        return;
      }
      if (!isQuarterHourSchedule(scheduledDate)) {
        Alert.alert('15-minute slots', 'Pick a start time in 15-minute increments.');
        return;
      }
      scheduledStartAt = scheduledDate.toISOString();
    }

    setBusy(true);
    submittingRef.current = true;
    setSubmitError(null);
    try {
      const { id, recurringCount } = await createLiveRoom(
        token,
        {
          title,
          description: tagline.trim() || undefined,
          ...(isBreak ? { category: scheduleCategory.trim() || 'Cards' } : {}),
          roomType: streamFormatToRoomType(streamFormat),
          scheduleMode,
          scheduledStartAt,
          thumbnailUrl: thumbUrl.trim() || undefined,
          ...(teaserUrl.trim() && teaserDurationMs != null
            ? { teaserVideoUrl: teaserUrl.trim(), teaserVideoDurationMs: teaserDurationMs }
            : {}),
          teamBoardLeague: isBreak ? 'nfl' : undefined,
          breakPricingMode: isBreak ? breakPricingMode : undefined,
          breakSpotPrice: isBreak ? breakSpotPrice : undefined,
          teamSelectionBoardEnabled: isBreak ? teamBoardEnabled : undefined,
          tipModeratorId,
          tipsToModerator,
          shippingCapEnabled: true,
          shippingCapCents: 999,
          shippingMode: 'capped',
          carrierPreference: 'best_rate',
          bundleEligiblePurchases: true,
          defaultShippingProfileId: defaultSellerShippingProfileId || undefined,
          recurringEnabled: scheduleMode === 'later' && recurringWeekly,
          discoveryVisibility,
        },
        { sellerUserId: freshReadiness.sellerUserId ?? null },
      );
      await notifyLiveDiscoveryChanged();
      onScheduled?.();
      resetForm();
      onClose();
      if (scheduleMode === 'now') {
        logVaultCommandCenter('create_enter_command_center', { roomId: id, scheduleMode: 'now' });
        onCreated(id);
        return;
      }
      const recurringNote =
        recurringCount && recurringCount > 1
          ? ` ${recurringCount} weekly shows were scheduled through the next month.`
          : '';
      Alert.alert(
        'Vault event scheduled',
        `Your show is set for ${formatScheduledDate(scheduledDate)}.${recurringNote} Go live from that event's command center when you are ready.`,
        [
          { text: 'Stay on events', style: 'cancel' },
          { text: 'Enter command center', onPress: () => onCreated(id) },
        ],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setSubmitError(msg);
      const sessionSub = supabaseJwtSub(token);
      logVaultCommandCenter('create_submit_failed', {
        message: msg.slice(0, 500),
        sessionSub,
        sellerId: freshReadiness.sellerUserId ?? sessionSub,
        userId: freshReadiness.sellerUserId ?? sessionSub,
      });
      const sessionExpired =
        msg.includes('Invalid or expired session') ||
        msg.includes('Unauthorized') ||
        msg.includes('Sign in to continue') ||
        msg.includes('session expired');
      const title =
        msg.includes('suspended') || msg.includes('ACCOUNT_SUSPENDED')
          ? 'Account suspended'
          : msg.includes('deleted') || msg.includes('ACCOUNT_DELETED')
            ? 'Account unavailable'
            : msg.includes('LIVE_NOT_READY') || msg.includes('Complete seller setup')
              ? 'Setup required'
              : sessionExpired
                ? 'Session expired'
                : 'Could not create event';
      if (sessionExpired) {
        Alert.alert(title, 'Your login expired. Sign in again to continue.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign in', onPress: () => navigateAuthLogin() },
        ]);
      } else {
        Alert.alert(title, msg);
      }
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }, [
    accessToken,
    breakPricingMode,
    breakSpotPrice,
    busy,
    isBreak,
    liveGate.alertBody,
    liveGate.alertTitle,
    liveGate.blocked,
    onClose,
    onCreated,
    onRefreshReadiness,
    onScheduled,
    resetForm,
    recurringWeekly,
    scheduleCategory,
    scheduleMode,
    scheduleTitle,
    scheduledDate,
    streamFormat,
    tagline,
    teamBoardEnabled,
    thumbUploading,
    teaserDurationMs,
    teaserUrl,
    thumbUrl,
    tipModeratorId,
    tipsToModerator,
    defaultSellerShippingProfileId,
    shippingProfiles.length,
    profilesLoadError,
    discoveryVisibility,
  ]);

  const submitLabel = useMemo(() => {
    if (busy) return 'Creating…';
    return scheduleMode === 'later' ? 'Schedule event' : 'Create & enter command center';
  }, [busy, scheduleMode]);

  const submitIcon = scheduleMode === 'later' ? 'calendar' : 'radio';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Create Vault Event</Text>
              <Text style={styles.headerSub}>Schedule later or start now in the command center</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets
          >
          <Text style={styles.label}>Event title</Text>
          <TextInput
            value={scheduleTitle}
            onChangeText={setScheduleTitle}
            placeholder="e.g. Optic Hobby PYT — 32 spots"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            value={tagline}
            onChangeText={setTagline}
            placeholder="What are you breaking? Any rules or shoutouts?"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.textArea]}
            multiline
          />

          <Text style={styles.label}>Cover image (optional)</Text>
          <View style={styles.thumbCard}>
            {thumbUrl ? (
              <View style={[styles.thumbPreviewFrame, thumbPreviewSize]}>
                <Image
                  source={{ uri: thumbUrl }}
                  style={styles.thumbPreview}
                  resizeMode="cover"
                  accessibilityLabel="Cover preview"
                />
              </View>
            ) : (
              <View style={[styles.thumbPlaceholder, styles.thumbPreviewFrame, thumbPreviewSize]}>
                <Ionicons name="image-outline" size={isTablet ? 34 : 28} color={colors.gold} />
                <Text style={[styles.thumbPlaceholderTxt, isTablet && styles.thumbPlaceholderTxtTablet]}>
                  Add a live tile image
                </Text>
                <Text style={styles.thumbHint}>JPG, PNG, or WebP · up to 20MB</Text>
              </View>
            )}
            <View style={[styles.thumbActions, { maxWidth: thumbPreviewSize.maxWidth }]}>
              <Pressable
                style={[
                  styles.thumbBtn,
                  isTablet && styles.thumbBtnTablet,
                  thumbUploading && styles.thumbBtnOff,
                ]}
                onPress={() => void pickThumbnail()}
                disabled={thumbUploading || busy}
              >
                {thumbUploading ? (
                  <ActivityIndicator color={colors.gold} size="small" />
                ) : (
                  <Text style={[styles.thumbBtnTxt, isTablet && styles.thumbBtnTxtTablet]}>
                    {thumbUrl ? 'Replace' : 'Choose image'}
                  </Text>
                )}
              </Pressable>
              {thumbUrl ? (
                <Pressable
                  style={[styles.thumbBtnGhost, isTablet && styles.thumbBtnTablet]}
                  onPress={resetThumb}
                  disabled={thumbUploading || busy}
                >
                  <Text style={[styles.thumbBtnGhostTxt, isTablet && styles.thumbBtnTxtTablet]}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
            {thumbError ? <Text style={styles.fieldError}>{thumbError}</Text> : null}
          </View>

          <Text style={styles.label}>Preview video (optional)</Text>
          <Text style={styles.thumbHint}>
            Short clip with sound · max 15 seconds. Loops in the room before you go live.
          </Text>
          <View style={styles.thumbActions}>
            <Pressable
              style={[styles.thumbBtn, teaserUploading && styles.thumbBtnOff]}
              onPress={() => void pickTeaser()}
              disabled={teaserUploading || busy}
            >
              {teaserUploading ? (
                <ActivityIndicator color={colors.gold} size="small" />
              ) : (
                <Text style={styles.thumbBtnTxt}>{teaserUrl ? 'Replace video' : 'Upload video'}</Text>
              )}
            </Pressable>
            {teaserUrl ? (
              <Pressable
                style={styles.thumbBtnGhost}
                onPress={() => {
                  setTeaserUrl('');
                  setTeaserDurationMs(null);
                  setTeaserError(null);
                }}
                disabled={teaserUploading || busy}
              >
                <Text style={styles.thumbBtnGhostTxt}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
          {teaserUrl && teaserDurationMs != null ? (
            <Text style={styles.thumbHint}>Uploaded · {(teaserDurationMs / 1000).toFixed(1)}s</Text>
          ) : null}
          {teaserError ? <Text style={styles.fieldError}>{teaserError}</Text> : null}

          <Text style={styles.label}>Format</Text>
          <View style={styles.chips}>
            {FORMATS.map((f) => {
              const on = streamFormat === f.id;
              return (
                <Pressable key={f.id} onPress={() => setStreamFormat(f.id)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {isBreak ? (
            <View style={styles.breakCard}>
              <Text style={styles.sectionTitle}>Break setup</Text>
              <Text style={styles.label}>Break category</Text>
              <View style={styles.chips}>
                {VAULT_EVENT_CATEGORY_OPTIONS.map((label) => {
                  const on = scheduleCategory === label;
                  return (
                    <Pressable
                      key={label}
                      onPress={() => setScheduleCategory(label)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.label}>Pricing</Text>
              <View style={styles.segment}>
                {BREAK_PRICING_MODES.map((mode) => {
                  const on = breakPricingMode === mode.id;
                  return (
                    <Pressable
                      key={mode.id}
                      style={[styles.segmentBtn, on && styles.segmentBtnOn]}
                      onPress={() => setBreakPricingMode(mode.id)}
                    >
                      <Text style={[styles.segmentTxt, on && styles.segmentTxtOn]}>{mode.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {breakPricingMode === 'fixed' || breakPricingMode === 'hybrid' ? (
                <>
                  <Text style={styles.label}>
                    {breakPricingMode === 'hybrid' ? 'Default spot price (USD, optional)' : 'Spot price (USD)'}
                  </Text>
                  <TextInput
                    value={breakSpotPrice}
                    onChangeText={setBreakSpotPrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                </>
              ) : null}
              {breakPricingMode === 'auction' ? (
                <Text style={styles.helperTxt}>Spot prices can be set per claim during the show.</Text>
              ) : null}
              {breakPricingMode === 'hybrid' ? (
                <Text style={styles.helperTxt}>
                  Run fixed-price team spots and auction lots in the same show. Optional default price applies to PYT tiles;
                  auction lots keep their own bids.
                </Text>
              ) : null}
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Team selection board</Text>
                  <Text style={styles.helperTxt}>PYT/PYD spot board — on by default for breaks.</Text>
                </View>
                <Switch
                  value={teamBoardEnabled}
                  onValueChange={setTeamBoardEnabled}
                  trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(212,175,55,0.45)' }}
                  thumbColor={teamBoardEnabled ? colors.gold : '#f4f3f4'}
                />
              </View>
            </View>
          ) : null}

          <Text style={styles.label}>Default shipping profile</Text>
          <View style={styles.profileWrap}>
            {profilesLoading ? (
              <View style={styles.profileStatusRow}>
                <ActivityIndicator color={colors.gold} size="small" />
                <Text style={styles.profileStatusTxt}>Loading shipping profiles…</Text>
              </View>
            ) : shippingProfiles.length === 0 ? (
              <View style={styles.profileEmptyBox}>
                <Text style={styles.profileEmptyTitle}>No profiles to select</Text>
                <Text style={styles.profileEmptyBody}>
                  {profilesLoadError ??
                    'Shipping profiles did not load. Retry here before creating the show.'}
                </Text>
                <Pressable style={styles.profileRetryBtn} onPress={() => void loadShippingProfiles()} disabled={busy}>
                  <Text style={styles.profileRetryTxt}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              shippingProfiles.map((profile) => {
                const selected = defaultSellerShippingProfileId === profile.id;
                return (
                  <Pressable
                    key={profile.id}
                    style={[styles.profileChip, selected && styles.profileChipOn]}
                    onPress={() => setDefaultSellerShippingProfileId(profile.id)}
                    disabled={busy}
                  >
                    <Text style={[styles.profileChipTxt, selected && styles.profileChipTxtOn]}>
                      {profile.name}
                      {profile.isDefault ? ' · default' : ''}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>
          <Text style={styles.helperTxt}>
            Auto-selected from your break category — Cards uses card mailer rates; Helmets uses full-size helmet rates. You can change it before creating the show.
          </Text>

          <Text style={styles.label}>Show visibility</Text>
          <View style={styles.segment}>
            <Pressable
              style={[styles.segmentBtn, discoveryVisibility === 'public' && styles.segmentBtnOn]}
              onPress={() => setDiscoveryVisibility('public')}
            >
              <Text style={[styles.segmentTxt, discoveryVisibility === 'public' && styles.segmentTxtOn]}>Public</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, discoveryVisibility === 'private' && styles.segmentBtnOn]}
              onPress={() => setDiscoveryVisibility('private')}
            >
              <Text style={[styles.segmentTxt, discoveryVisibility === 'private' && styles.segmentTxtOn]}>Private</Text>
            </Pressable>
          </View>
          <Text style={styles.helperTxt}>
            {discoveryVisibility === 'public'
              ? 'Public shows appear on the Live Shows tab for all buyers.'
              : 'Private shows are hidden from Live Shows and do not notify your followers when you go live. Share your link to invite viewers.'}
          </Text>

          <Text style={styles.label}>When to go live</Text>
          <View style={styles.segment}>
            <Pressable
              style={[styles.segmentBtn, scheduleMode === 'now' && styles.segmentBtnOn]}
              onPress={() => setScheduleMode('now')}
            >
              <Text style={[styles.segmentTxt, scheduleMode === 'now' && styles.segmentTxtOn]}>Start now</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, scheduleMode === 'later' && styles.segmentBtnOn]}
              onPress={() => {
                setScheduleMode('later');
                setScheduledDate((d) => alignScheduleToQuarterHour(d));
              }}
            >
              <Text style={[styles.segmentTxt, scheduleMode === 'later' && styles.segmentTxtOn]}>Schedule later</Text>
            </Pressable>
          </View>
          {scheduleMode === 'later' ? (
            <>
              <Pressable
                style={styles.dateBtn}
                onPress={() => {
                  setShowTimePicker(false);
                  setShowDatePicker(true);
                }}
              >
                <Ionicons name="time-outline" size={18} color={colors.gold} />
                <Text style={styles.dateTxt}>{formatScheduledDate(scheduledDate)}</Text>
              </Pressable>
              {Platform.OS === 'ios' && showDatePicker ? (
                <>
                  <DateTimePicker
                    value={scheduledDate}
                    mode="datetime"
                    display="spinner"
                    minimumDate={new Date()}
                    minuteInterval={15}
                    onChange={(_, d) => {
                      if (d) setScheduledDate(alignScheduleToQuarterHour(d));
                    }}
                  />
                  <Pressable
                    style={styles.donePicker}
                    onPress={() => {
                      setShowDatePicker(false);
                      setShowTimePicker(false);
                    }}
                  >
                    <Text style={styles.donePickerTxt}>Done</Text>
                  </Pressable>
                </>
              ) : null}
              {Platform.OS === 'android' && showDatePicker ? (
                <DateTimePicker
                  value={scheduledDate}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onChange={(event, d) => {
                    setShowDatePicker(false);
                    if (event.type === 'dismissed' || !d) return;
                    const next = new Date(scheduledDate);
                    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                    setScheduledDate(alignScheduleToQuarterHour(next));
                    setShowTimePicker(true);
                  }}
                />
              ) : null}
              {Platform.OS === 'android' && showTimePicker ? (
                <DateTimePicker
                  value={scheduledDate}
                  mode="time"
                  display="default"
                  onChange={(event, d) => {
                    setShowTimePicker(false);
                    if (event.type === 'dismissed' || !d) return;
                    const next = new Date(scheduledDate);
                    next.setHours(d.getHours(), d.getMinutes(), 0, 0);
                    setScheduledDate(alignScheduleToQuarterHour(next));
                  }}
                />
              ) : null}
              <Text style={styles.helperTxt}>Start times snap to 15-minute increments.</Text>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Repeat weekly</Text>
                  <Text style={styles.helperTxt}>Schedule the same show every week for up to one month.</Text>
                </View>
                <Switch
                  value={recurringWeekly}
                  onValueChange={setRecurringWeekly}
                  trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(212,175,55,0.45)' }}
                  thumbColor={recurringWeekly ? colors.gold : '#f4f3f4'}
                />
              </View>
            </>
          ) : (
            <Text style={styles.helperTxt}>
              Creates the room and opens the host command center. Go live from there when you are ready.
            </Text>
          )}

          <LiveShowTipModeratorFields
            accessToken={accessToken}
            tipModeratorId={tipModeratorId}
            tipModeratorUsername={tipModeratorUsername}
            tipsToModerator={tipsToModerator}
            disabled={busy}
            onModeratorChange={(id, username) => {
              setTipModeratorId(id);
              setTipModeratorUsername(username);
              if (!id) setTipsToModerator(false);
            }}
            onTipsToModeratorChange={setTipsToModerator}
          />

          <CreateVaultEventReadinessChecklist
            readiness={readiness}
            loading={readinessLoading}
            titleComplete={titleComplete}
            onFixStripe={() => onFixReadiness?.('stripe')}
            onFixShipFrom={() => onFixReadiness?.('ship_from')}
          />

          {submitError ? <Text style={styles.fieldError}>{submitError}</Text> : null}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <Pressable
              style={[
                styles.primary,
                isTablet && styles.primaryTablet,
                (createBlocked || busy || thumbUploading) && styles.primaryOff,
              ]}
              onPress={() => void submit()}
              disabled={busy || createBlocked || thumbUploading}
            >
              {busy ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Ionicons name={submitIcon} size={isTablet ? 22 : 20} color={colors.background} />
                  <Text style={[styles.primaryTxt, isTablet && styles.primaryTxtTablet]}>{submitLabel}</Text>
                </>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerSpacer: {
    width: 26,
  },
  headerTitle: { fontSize: 17, fontWeight: '900', color: colors.textPrimary },
  headerSub: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  form: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  label: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginTop: spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: colors.textPrimary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  helperTxt: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  fieldError: { fontSize: 13, color: '#fca5a5', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  chipTxt: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  chipTxtOn: { color: colors.gold },
  profileWrap: { gap: 8, marginTop: spacing.xs },
  profileStatusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  profileStatusTxt: { fontSize: 13, color: colors.textSecondary },
  profileEmptyBox: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    backgroundColor: 'rgba(120,53,15,0.22)',
  },
  profileEmptyTitle: { fontSize: 13, fontWeight: '800', color: '#FFD699' },
  profileEmptyBody: { fontSize: 12, lineHeight: 17, color: '#FFE4B5' },
  profileRetryBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: `${colors.gold}18`,
  },
  profileRetryTxt: { fontSize: 12, fontWeight: '800', color: colors.gold },
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
  profileChipTxt: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  profileChipTxtOn: { color: colors.gold },
  segment: {
    flexDirection: 'row',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  segmentBtnOn: { backgroundColor: 'rgba(212,175,55,0.2)' },
  segmentTxt: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  segmentTxtOn: { color: colors.gold },
  breakCard: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    gap: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  toggleTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  thumbCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    borderRadius: radii.lg,
    padding: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  thumbPreviewFrame: {
    alignSelf: 'center',
    width: '100%',
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  thumbPreview: { width: '100%', height: '100%' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  thumbPlaceholderTxt: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  thumbPlaceholderTxtTablet: { fontSize: 16 },
  thumbHint: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  thumbActions: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: '100%',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  thumbBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  thumbBtnTablet: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbBtnOff: { opacity: 0.6 },
  thumbBtnTxt: { fontSize: 12, fontWeight: '800', color: colors.gold },
  thumbBtnTxtTablet: { fontSize: 15 },
  thumbBtnGhost: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  thumbBtnGhostTxt: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  dateTxt: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  donePicker: { alignSelf: 'flex-end', padding: spacing.sm },
  donePickerTxt: { fontSize: 15, fontWeight: '800', color: colors.gold },
  footer: { paddingHorizontal: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: radii.lg,
    backgroundColor: colors.gold,
  },
  primaryOff: { opacity: 0.5 },
  primaryTablet: { minHeight: 54, paddingVertical: 18 },
  primaryTxt: { fontSize: 16, fontWeight: '900', color: colors.background },
  primaryTxtTablet: { fontSize: 18 },
});
