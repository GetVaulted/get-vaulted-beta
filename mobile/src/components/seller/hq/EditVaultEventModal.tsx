import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LiveRoomApiRow } from '../../../api/liveRoomsRepository';
import { patchLiveRoomMetadata } from '../../../api/liveHostRepository';
import { uploadListingImageViaWeb } from '../../../api/webListingsRepository';
import { uploadLiveTeaserToSupabase } from '../../../api/liveTeaserRepository';
import { alignScheduleToQuarterHour, isQuarterHourSchedule } from '../../../lib/createLiveRoomPayload';
import { supabaseJwtSub } from '../../../lib/logVaultCommandCenterFlow';
import {
  LIVE_TEASER_MAX_BYTES,
  LIVE_TEASER_MAX_DURATION_MS,
  LIVE_TEASER_MIN_DURATION_MS,
} from '../../../lib/liveTeaserLimits';
import { notifyLiveDiscoveryChanged } from '../../../lib/notifyLiveDiscoveryChanged';
import { resolveSellerAccessToken } from '../../../lib/resolveSellerAccessToken';
import { colors, radii, spacing } from '../../../theme';

const THUMBNAIL_MAX_BYTES = 20 * 1024 * 1024;

function formatScheduledDate(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Parse a scheduled ISO into a quarter-hour aligned Date, falling back to +1h from now. */
function initialScheduledDate(iso: string | null): Date {
  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return alignScheduleToQuarterHour(new Date(Date.now() + 60 * 60 * 1000));
}

/**
 * Focused editor for a scheduled show's public details: title, discovery description, cover image,
 * and start time. Intentionally separate from the create flow (`ScheduleVaultEventModal`), which
 * also owns readiness/shipping/break/recurring setup that can't change after creation.
 */
export function EditVaultEventModal({
  visible,
  room,
  accessToken,
  onClose,
  onSaved,
}: {
  visible: boolean;
  room: LiveRoomApiRow | null;
  accessToken?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbUrl, setThumbUrl] = useState('');
  const [thumbUploading, setThumbUploading] = useState(false);
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [teaserUrl, setTeaserUrl] = useState('');
  const [teaserDurationMs, setTeaserDurationMs] = useState<number | null>(null);
  const [teaserUploading, setTeaserUploading] = useState(false);
  const [teaserError, setTeaserError] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState<Date>(() => initialScheduledDate(null));
  const [scheduleTouched, setScheduleTouched] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // Re-seed the form whenever a different show opens the modal.
  useEffect(() => {
    if (!visible || !room) return;
    setTitle(room.title ?? '');
    setDescription(room.description ?? '');
    setThumbUrl(room.thumbnailUrl ?? '');
    setTeaserUrl(room.teaserVideoUrl ?? '');
    setTeaserDurationMs(
      typeof room.teaserVideoDurationMs === 'number' && Number.isFinite(room.teaserVideoDurationMs)
        ? room.teaserVideoDurationMs
        : null,
    );
    setScheduledDate(initialScheduledDate(room.scheduledStartAt));
    setScheduleTouched(false);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setThumbError(null);
    setTeaserError(null);
    setSubmitError(null);
  }, [visible, room]);

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

  const submit = useCallback(async () => {
    if (!room || submittingRef.current || busy) return;
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      Alert.alert('Title required', 'Give your show a title of at least 3 characters.');
      return;
    }
    if (thumbUploading || teaserUploading) return;

    let scheduledStartAt: string | undefined;
    if (scheduleTouched) {
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

    let token: string;
    try {
      token = await resolveSellerAccessToken(accessToken);
    } catch {
      Alert.alert('Sign in required', 'Sign in to edit this show.');
      return;
    }

    setBusy(true);
    submittingRef.current = true;
    setSubmitError(null);
    try {
      await patchLiveRoomMetadata(token, room.id, {
        title: trimmedTitle,
        description: description.trim(),
        thumbnailUrl: thumbUrl.trim(),
        ...(teaserUrl.trim()
          ? teaserDurationMs != null
            ? { teaserVideoUrl: teaserUrl.trim(), teaserVideoDurationMs: teaserDurationMs }
            : {}
          : { teaserVideoUrl: null, teaserVideoDurationMs: null }),
        ...(scheduledStartAt ? { scheduledStartAt } : {}),
      });
      await notifyLiveDiscoveryChanged();
      onSaved();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save changes.';
      setSubmitError(msg);
      Alert.alert('Could not save changes', msg);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }, [
    accessToken,
    busy,
    description,
    onClose,
    onSaved,
    room,
    scheduleTouched,
    scheduledDate,
    teaserDurationMs,
    teaserUploading,
    teaserUrl,
    thumbUploading,
    thumbUrl,
    title,
  ]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Edit show</Text>
              <Text style={styles.headerSub}>Update the title, description, cover, and start time</Text>
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
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Optic Hobby PYT — 32 spots"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What are you breaking? Any rules or shoutouts?"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.textArea]}
              multiline
            />

            <Text style={styles.label}>Cover image (optional)</Text>
            <View style={styles.thumbCard}>
              {thumbUrl ? (
                <View style={styles.thumbPreviewFrame}>
                  <Image source={{ uri: thumbUrl }} style={styles.thumbPreview} resizeMode="cover" accessibilityLabel="Cover preview" />
                </View>
              ) : (
                <View style={[styles.thumbPlaceholder, styles.thumbPreviewFrame]}>
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
                  <Pressable
                    style={styles.thumbBtnGhost}
                    onPress={() => {
                      setThumbUrl('');
                      setThumbError(null);
                    }}
                    disabled={thumbUploading || busy}
                  >
                    <Text style={styles.thumbBtnGhostTxt}>Remove</Text>
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

            <Text style={styles.label}>Start time</Text>
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
                    if (d) {
                      setScheduledDate(alignScheduleToQuarterHour(d));
                      setScheduleTouched(true);
                    }
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
                  setScheduleTouched(true);
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
                  setScheduleTouched(true);
                }}
              />
            ) : null}
            <Text style={styles.helperTxt}>Start times snap to 15-minute increments. Buyers with reminders are notified of the new time.</Text>

            {submitError ? <Text style={styles.fieldError}>{submitError}</Text> : null}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <Pressable
              style={[styles.primary, (busy || thumbUploading) && styles.primaryOff]}
              onPress={() => void submit()}
              disabled={busy || thumbUploading}
            >
              {busy ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color={colors.background} />
                  <Text style={styles.primaryTxt}>Save changes</Text>
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
  root: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1 },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 26 },
  headerTitle: { fontSize: 17, fontWeight: '900', color: colors.textPrimary },
  headerSub: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  form: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  label: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginTop: spacing.sm },
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
    maxWidth: 320,
    height: 180,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  thumbPreview: { width: '100%', height: '100%' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  thumbPlaceholderTxt: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  thumbHint: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  thumbActions: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
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
  footer: {
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
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
