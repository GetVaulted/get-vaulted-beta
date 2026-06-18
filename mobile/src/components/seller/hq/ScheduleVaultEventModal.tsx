import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createLiveRoom, streamFormatToRoomType } from '../../../api/liveRoomsRepository';
import { fetchSellerLiveReadiness, type SellerLiveReadiness } from '../../../api/liveHostRepository';
import { logVaultCommandCenter, supabaseJwtSub } from '../../../lib/logVaultCommandCenterFlow';
import { resolveSellerAccessToken } from '../../../lib/resolveSellerAccessToken';
import { uploadListingImageViaWeb } from '../../../api/webListingsRepository';
import {
  alignScheduleToQuarterHour,
  isQuarterHourSchedule,
  type BreakPricingMode,
  type CreateScheduleMode,
  type TeamBoardLeague,
} from '../../../lib/createLiveRoomPayload';
import { CreateVaultEventReadinessChecklist } from './CreateVaultEventReadinessChecklist';
import { LiveShowTipModeratorFields } from './LiveShowTipModeratorFields';
import { notifyLiveDiscoveryChanged } from '../../../lib/notifyLiveDiscoveryChanged';
import type { LiveSalesGate } from '../../../lib/sellerLiveReadiness';
import { streamCategories } from '../../../data/sellerHubMock';
import { colors, radii, spacing } from '../../../theme';

const THUMBNAIL_MAX_BYTES = 20 * 1024 * 1024;
const LEAGUES: TeamBoardLeague[] = ['nfl', 'nba', 'mlb'];

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
  const [tagline, setTagline] = useState('');
  const [scheduleMode, setScheduleMode] = useState<CreateScheduleMode>('now');
  const [scheduledDate, setScheduledDate] = useState(defaultScheduledDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState('');
  const [thumbUploading, setThumbUploading] = useState(false);
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [teamBoardLeague, setTeamBoardLeague] = useState<TeamBoardLeague>('nfl');
  const [breakSpotsCount, setBreakSpotsCount] = useState('32');
  const [breakPricingMode, setBreakPricingMode] = useState<BreakPricingMode>('auction');
  const [breakSpotPrice, setBreakSpotPrice] = useState('');
  const [teamBoardEnabled, setTeamBoardEnabled] = useState(true);
  const [tipModeratorId, setTipModeratorId] = useState<string | null>(null);
  const [tipModeratorUsername, setTipModeratorUsername] = useState('');
  const [tipsToModerator, setTipsToModerator] = useState(false);
  const [modalReadinessBusy, setModalReadinessBusy] = useState(false);

  const titleComplete = scheduleTitle.trim().length > 0;
  const readinessOk = readiness?.canGoLive === true;
  const readinessKnown = readiness !== null && !modalReadinessBusy;
  const liveBlocked = liveGate.blocked || !readinessKnown || !readinessOk;
  const isBreak = streamFormat === 'break';

  useEffect(() => {
    if (!visible) return;
    setSubmitError(null);
    setModalReadinessBusy(true);
    void (async () => {
      try {
        await onRefreshReadiness?.();
      } finally {
        setModalReadinessBusy(false);
      }
    })();
  }, [visible, onRefreshReadiness]);

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

  const submit = useCallback(async () => {
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
    setSubmitError(null);
    try {
      const { id } = await createLiveRoom(
        token,
        {
          title,
          description: tagline.trim() || undefined,
          category: scheduleCategory.trim() || 'Other',
          roomType: streamFormatToRoomType(streamFormat),
          scheduleMode,
          scheduledStartAt,
          thumbnailUrl: thumbUrl.trim() || undefined,
          teamBoardLeague: isBreak ? teamBoardLeague : undefined,
          breakTotalSpots: isBreak ? breakSpotsCount : undefined,
          breakPricingMode: isBreak ? breakPricingMode : undefined,
          breakSpotPrice: isBreak ? breakSpotPrice : undefined,
          teamSelectionBoardEnabled: isBreak ? teamBoardEnabled : undefined,
          tipModeratorId,
          tipsToModerator,
          shippingCapEnabled: true,
          shippingCapCents: 1199,
          freeShippingEnabled: false,
          sellerPaysOverCap: true,
        },
        { sellerUserId: freshReadiness.sellerUserId ?? null },
      );
      await notifyLiveDiscoveryChanged();
      onScheduled?.();
      onClose();
      if (scheduleMode === 'now') {
        logVaultCommandCenter('create_enter_command_center', { roomId: id, scheduleMode: 'now' });
        onCreated(id);
        return;
      }
      Alert.alert(
        'Vault event scheduled',
        `Your show is set for ${formatScheduledDate(scheduledDate)}. Go live from that event's command center when you are ready.`,
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
      const title =
        msg.includes('suspended') || msg.includes('ACCOUNT_SUSPENDED')
          ? 'Account suspended'
          : msg.includes('deleted') || msg.includes('ACCOUNT_DELETED')
            ? 'Account unavailable'
            : msg.includes('LIVE_NOT_READY') || msg.includes('Complete seller setup')
              ? 'Setup required'
              : msg.includes('Invalid or expired session') || msg.includes('Unauthorized')
                ? 'Session expired'
                : 'Could not create event';
      Alert.alert(title, msg);
    } finally {
      setBusy(false);
    }
  }, [
    accessToken,
    breakPricingMode,
    breakSpotPrice,
    breakSpotsCount,
    isBreak,
    liveGate.alertBody,
    liveGate.alertTitle,
    liveGate.blocked,
    onClose,
    onCreated,
    onRefreshReadiness,
    onScheduled,
    scheduleCategory,
    scheduleMode,
    scheduleTitle,
    scheduledDate,
    streamFormat,
    tagline,
    teamBoardEnabled,
    teamBoardLeague,
    thumbUploading,
    thumbUrl,
    tipModeratorId,
    tipsToModerator,
  ]);

  const submitLabel = useMemo(() => {
    if (busy) return 'Creating…';
    return scheduleMode === 'later' ? 'Schedule event' : 'Create & enter command center';
  }, [busy, scheduleMode]);

  const submitIcon = scheduleMode === 'later' ? 'calendar' : 'radio';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Create Vault Event</Text>
            <Text style={styles.headerSub}>Schedule later or start now in the command center</Text>
          </View>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
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
              <Image
                source={{ uri: thumbUrl }}
                style={styles.thumbPreview}
                resizeMode="cover"
                accessibilityLabel="Cover preview"
              />
            ) : (
              <View style={styles.thumbPlaceholder}>
                <Ionicons name="image-outline" size={28} color={colors.gold} />
                <Text style={styles.thumbPlaceholderTxt}>Add a live tile image</Text>
                <Text style={styles.thumbHint}>JPG, PNG, or WebP · up to 20MB</Text>
              </View>
            )}
            <View style={styles.thumbActions}>
              <Pressable
                style={[styles.thumbBtn, thumbUploading && styles.thumbBtnOff]}
                onPress={() => void pickThumbnail()}
                disabled={thumbUploading || busy}
              >
                {thumbUploading ? (
                  <ActivityIndicator color={colors.gold} size="small" />
                ) : (
                  <Text style={styles.thumbBtnTxt}>{thumbUrl ? 'Replace' : 'Choose image'}</Text>
                )}
              </Pressable>
              {thumbUrl ? (
                <Pressable style={styles.thumbBtnGhost} onPress={resetThumb} disabled={thumbUploading || busy}>
                  <Text style={styles.thumbBtnGhostTxt}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
            {thumbError ? <Text style={styles.fieldError}>{thumbError}</Text> : null}
          </View>

          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {streamCategories.map((c) => {
              const on = scheduleCategory === c.label;
              return (
                <Pressable
                  key={c.label}
                  onPress={() => setScheduleCategory(c.label)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

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
              <Text style={styles.label}>League</Text>
              <View style={styles.chips}>
                {LEAGUES.map((lg) => {
                  const on = teamBoardLeague === lg;
                  return (
                    <Pressable
                      key={lg}
                      onPress={() => setTeamBoardLeague(lg)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{lg.toUpperCase()}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.label}>Total spots</Text>
              <TextInput
                value={breakSpotsCount}
                onChangeText={setBreakSpotsCount}
                keyboardType="number-pad"
                placeholder="32"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <Text style={styles.label}>Pricing</Text>
              <View style={styles.segment}>
                <Pressable
                  style={[styles.segmentBtn, breakPricingMode === 'fixed' && styles.segmentBtnOn]}
                  onPress={() => setBreakPricingMode('fixed')}
                >
                  <Text style={[styles.segmentTxt, breakPricingMode === 'fixed' && styles.segmentTxtOn]}>Fixed price</Text>
                </Pressable>
                <Pressable
                  style={[styles.segmentBtn, breakPricingMode === 'auction' && styles.segmentBtnOn]}
                  onPress={() => setBreakPricingMode('auction')}
                >
                  <Text style={[styles.segmentTxt, breakPricingMode === 'auction' && styles.segmentTxtOn]}>
                    Auction spots
                  </Text>
                </Pressable>
              </View>
              {breakPricingMode === 'fixed' ? (
                <>
                  <Text style={styles.label}>Spot price (USD)</Text>
                  <TextInput
                    value={breakSpotPrice}
                    onChangeText={setBreakSpotPrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                </>
              ) : (
                <Text style={styles.helperTxt}>Spot prices can be set per claim during the show.</Text>
              )}
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Team selection board</Text>
                  <Text style={styles.helperTxt}>PYT tiles for your league — on by default for breaks.</Text>
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
              <Pressable style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="time-outline" size={18} color={colors.gold} />
                <Text style={styles.dateTxt}>{formatScheduledDate(scheduledDate)}</Text>
              </Pressable>
              {showDatePicker ? (
                <DateTimePicker
                  value={scheduledDate}
                  mode="datetime"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={new Date()}
                  minuteInterval={15}
                  onChange={(_, d) => {
                    if (Platform.OS === 'android') setShowDatePicker(false);
                    if (d) setScheduledDate(alignScheduleToQuarterHour(d));
                  }}
                />
              ) : null}
              {Platform.OS === 'ios' && showDatePicker ? (
                <Pressable style={styles.donePicker} onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.donePickerTxt}>Done</Text>
                </Pressable>
              ) : null}
              <Text style={styles.helperTxt}>Start times snap to 15-minute increments.</Text>
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
            loading={readinessLoading || modalReadinessBusy}
            titleComplete={titleComplete}
            onFixStripe={() => onFixReadiness?.('stripe')}
            onFixShipFrom={() => onFixReadiness?.('ship_from')}
          />

          {submitError ? <Text style={styles.fieldError}>{submitError}</Text> : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Pressable
            style={[styles.primary, (liveBlocked || busy || thumbUploading || !titleComplete) && styles.primaryOff]}
            onPress={() => void submit()}
            disabled={busy || liveBlocked || thumbUploading || !titleComplete}
          >
            {busy ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <>
                <Ionicons name={submitIcon} size={20} color={colors.background} />
                <Text style={styles.primaryTxt}>{submitLabel}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
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
  thumbPreview: { width: '100%', aspectRatio: 5 / 4, borderRadius: radii.md },
  thumbPlaceholder: { alignItems: 'center', paddingVertical: spacing.lg, gap: 6 },
  thumbPlaceholderTxt: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  thumbHint: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  thumbActions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  thumbBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  thumbBtnOff: { opacity: 0.6 },
  thumbBtnTxt: { fontSize: 12, fontWeight: '800', color: colors.gold },
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
  primaryTxt: { fontSize: 16, fontWeight: '900', color: colors.background },
});
