import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { uploadListingImageViaWeb } from '../../../api/webListingsRepository';
import type { LiveGiveawayRow } from '../../../api/liveGiveawayRepository';
import {
  createLiveGiveaway,
  promoEntrySlugFromUrl,
} from '../../../api/liveGiveawayRepository';
import type { HostGiveawayAction } from '../../../hooks/useHostGiveawayActions';
import { openPromoEntry } from '../../../navigation/openPromoEntry';
import { useGiveawayCountdown } from '../../../hooks/useGiveawayCountdown';
import { GIVVY_DEFAULT_BUYERS_RULES_TEXT } from '../../../lib/givvyUi';
import { colors, radii, spacing } from '../../../theme';
import { SellerGiveawayEntrantList } from './SellerGiveawayEntrantList';

function HostGiveawayTimer({
  entryCloseAt,
  onExpired,
}: {
  entryCloseAt: string | null | undefined;
  onExpired?: () => void;
}) {
  const { label } = useGiveawayCountdown(entryCloseAt, onExpired);
  if (!label) return null;
  return <Text style={styles.timer}>{label}</Text>;
}

type Lane = 'open' | 'buyers';

const THUMBNAIL_MAX_BYTES = 20 * 1024 * 1024;

function statusLabel(status: LiveGiveawayRow['status']) {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'entries_open':
      return 'Entries open';
    case 'entries_closed':
      return 'Closed';
    case 'drawn':
      return 'Drawn';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

function GiveawayActionButton({
  label,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  tone: 'green' | 'amber' | 'violet' | 'muted' | 'danger';
  disabled?: boolean;
  onPress: () => void;
}) {
  const palette = {
    green: { border: 'rgba(52,211,153,0.35)', bg: 'rgba(16,185,129,0.12)', text: '#6ee7b7' },
    amber: { border: 'rgba(251,191,36,0.35)', bg: 'rgba(245,158,11,0.12)', text: '#fcd34d' },
    violet: { border: 'rgba(167,139,250,0.4)', bg: 'rgba(139,92,246,0.14)', text: '#c4b5fd' },
    muted: { border: colors.border, bg: colors.background, text: colors.textSecondary },
    danger: { border: 'rgba(248,113,113,0.35)', bg: 'rgba(127,29,29,0.2)', text: '#fca5a5' },
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        {
          borderColor: palette.border,
          backgroundColor: palette.bg,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.actionBtnTxt, { color: palette.text }]}>{label}</Text>
    </Pressable>
  );
}

export function SellerLiveGiveawaySheet({
  visible,
  onClose,
  accessToken,
  roomId,
  giveaways,
  busy,
  onRunAction,
  onRefresh,
  onToast,
}: {
  visible: boolean;
  onClose: () => void;
  accessToken: string;
  roomId: string;
  giveaways: LiveGiveawayRow[];
  busy: boolean;
  onRunAction: (id: string, action: HostGiveawayAction) => void;
  onRefresh: () => Promise<void>;
  onToast?: (message: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [lane, setLane] = useState<Lane>('open');
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [prizeDescription, setPrizeDescription] = useState('');
  const [rulesText, setRulesText] = useState('');
  const [openOnCreate, setOpenOnCreate] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [entriesGiveawayId, setEntriesGiveawayId] = useState<string | null>(null);

  const rows = useMemo(() => giveaways.filter((g) => g.kind === lane), [giveaways, lane]);

  useEffect(() => {
    if (!visible) {
      setKeyboardInset(0);
      setEntriesGiveawayId(null);
      return undefined;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (evt) => {
      setKeyboardInset(evt.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const scrollFormIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const resetForm = useCallback(
    (forLane: Lane = lane) => {
      setTitle('');
      setPrizeDescription('');
      // Buyers giveaways require 80+ characters of official rules before they can be created —
      // prefill boilerplate so the host edits/confirms it instead of starting from a blank box.
      setRulesText(forLane === 'buyers' ? GIVVY_DEFAULT_BUYERS_RULES_TEXT : '');
      setOpenOnCreate(true);
      setFormError(null);
      setCreating(false);
      setImageUri(null);
      setImageUrl(null);
      setImageError(null);
    },
    [lane],
  );

  const pickPhoto = useCallback(async () => {
    setImageError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setImageError('Allow photo access to add a prize image.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
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
  }, [accessToken]);

  const copyAmoeLink = useCallback(
    async (url: string) => {
      await Clipboard.setStringAsync(url);
      onToast?.('AMOE link copied.');
    },
    [onToast],
  );

  const shareAmoeLink = useCallback(async (url: string) => {
    try {
      await Share.share({ message: url, url });
    } catch {
      /* user dismissed */
    }
  }, []);

  const openAmoePreview = useCallback((url: string, slug: string | null) => {
    if (slug) {
      openPromoEntry(slug);
      return;
    }
    void shareAmoeLink(url);
  }, [shareAmoeLink]);

  const runAction = useCallback(
    (id: string, action: HostGiveawayAction) => {
      setFormError(null);
      void onRunAction(id, action);
    },
    [onRunAction],
  );

  const handleCreate = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setFormError('Enter a title.');
      return;
    }
    if (lane === 'buyers' && rulesText.trim().length < 80) {
      setFormError('Buyers giveaways need official rules (80+ characters).');
      return;
    }
    setCreateBusy(true);
    setFormError(null);
    try {
      await createLiveGiveaway(accessToken, roomId, {
        kind: lane,
        title: trimmed,
        prizeDescription: prizeDescription.trim(),
        imageUrl: imageUrl?.trim() || undefined,
        rulesText: rulesText.trim(),
        openEntries: openOnCreate,
      });
      resetForm();
      await onRefresh();
      if (lane === 'buyers') {
        onToast?.('Buyers giveaway created — AMOE link is in official rules.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not create giveaway.';
      setFormError(msg);
    } finally {
      setCreateBusy(false);
    }
  }, [
    accessToken,
    lane,
    imageUrl,
    onToast,
    onRefresh,
    openOnCreate,
    prizeDescription,
    resetForm,
    roomId,
    rulesText,
    title,
  ]);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss giveaways" />
        <View
          style={[
            styles.drawer,
            {
              paddingBottom: insets.bottom + spacing.lg,
              marginBottom: keyboardInset,
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>Giveaways</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.tabs}>
            {(['open', 'buyers'] as const).map((t) => {
              const active = lane === t;
              const label = t === 'open' ? 'Giveaway' : 'Buyers';
              return (
                <Pressable
                  key={t}
                  onPress={() => {
                    setLane(t);
                    resetForm(t);
                  }}
                  style={[styles.tab, active && styles.tabActive]}
                >
                  <Text style={[styles.tabTxt, active && styles.tabTxtActive]} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {lane === 'buyers' ? (
              <Text style={styles.hint}>
                Purchases enter buyers silently. AMOE link is only in official rules — not on stage.
              </Text>
            ) : (
              <Text style={styles.hint}>Everyone in the room can enter while entries are open.</Text>
            )}

            {creating ? (
              <View style={styles.form}>
                <Pressable
                  style={[styles.photoBox, imageUri && styles.photoBoxFilled]}
                  onPress={() => void pickPhoto()}
                  disabled={busy || imageUploading}
                >
                  {imageUri ? (
                    <Image source={{ uri: imageUri }} style={styles.photoPreview} contentFit="cover" />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Ionicons name="camera-outline" size={24} color={colors.gold} />
                      <Text style={styles.photoPlaceholderTxt}>Prize photo (optional)</Text>
                    </View>
                  )}
                  {imageUploading ? (
                    <View style={styles.photoUploading}>
                      <ActivityIndicator color={colors.gold} />
                    </View>
                  ) : null}
                </Pressable>
                {imageError ? <Text style={styles.error}>{imageError}</Text> : null}
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  onFocus={scrollFormIntoView}
                  placeholder="Giveaway title"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                <TextInput
                  value={prizeDescription}
                  onChangeText={setPrizeDescription}
                  onFocus={scrollFormIntoView}
                  placeholder="Prize description"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                {lane === 'buyers' ? (
                  <TextInput
                    value={rulesText}
                    onChangeText={setRulesText}
                    onFocus={scrollFormIntoView}
                    placeholder="Official promotion rules (required)"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, styles.textArea]}
                    multiline
                  />
                ) : null}
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Open entries on create</Text>
                  <Switch value={openOnCreate} onValueChange={setOpenOnCreate} />
                </View>
                {formError ? <Text style={styles.error}>{formError}</Text> : null}
                <View style={styles.formActions}>
                  <Pressable style={styles.secondaryBtn} onPress={() => resetForm()}>
                    <Text style={styles.secondaryBtnTxt}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.primaryBtn} disabled={busy || createBusy} onPress={() => void handleCreate()}>
                    {busy || createBusy ? <ActivityIndicator color="#111" /> : <Text style={styles.primaryBtnTxt}>Create</Text>}
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable style={styles.createBtn} disabled={busy} onPress={() => setCreating(true)}>
                <Text style={styles.createBtnTxt}>
                  + Create {lane === 'open' ? 'giveaway' : 'buyers giveaway'}
                </Text>
              </Pressable>
            )}

            {rows.length === 0 ? (
              <Text style={styles.empty}>No giveaways in this lane yet.</Text>
            ) : (
              rows.map((g) => (
                <View key={g.id} style={styles.card}>
                  <View style={styles.cardRow}>
                    {g.imageUrl?.trim() ? (
                      <Image source={{ uri: g.imageUrl.trim() }} style={styles.cardThumb} contentFit="cover" />
                    ) : null}
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle}>{g.title}</Text>
                      {g.prizeDescription ?                       <Text style={styles.cardSub}>{g.prizeDescription}</Text> : null}
                      <Pressable
                        style={styles.entriesToggleRow}
                        onPress={() => setEntriesGiveawayId((id) => (id === g.id ? null : g.id))}
                        hitSlop={4}
                      >
                        <Text style={styles.cardMeta}>
                          {statusLabel(g.status)} · {g.entryCount}{' '}
                          {g.entryCount === 1 ? 'entry' : 'entries'}
                        </Text>
                        <View style={styles.entriesToggleAction}>
                          <Text style={styles.entriesToggleTxt}>
                            {entriesGiveawayId === g.id ? 'Hide' : 'View entrants'}
                          </Text>
                          <Ionicons
                            name={entriesGiveawayId === g.id ? 'chevron-up' : 'chevron-down'}
                            size={14}
                            color="#6ee7b7"
                          />
                        </View>
                      </Pressable>
                      {entriesGiveawayId === g.id ? (
                        <SellerGiveawayEntrantList
                          accessToken={accessToken}
                          roomId={roomId}
                          giveawayId={g.id}
                          kind={g.kind}
                          showActiveInRoom={g.kind === 'open' && g.status === 'entries_open'}
                          refreshKey={`${g.entryCount}-${g.updatedAt}`}
                        />
                      ) : null}
                      {g.status === 'entries_open' && g.entryCloseAt ? (
                        <HostGiveawayTimer entryCloseAt={g.entryCloseAt} onExpired={() => void onRefresh()} />
                      ) : null}
                      {g.winnerUsername ? <Text style={styles.winner}>Winner @{g.winnerUsername}</Text> : null}
                    </View>
                  </View>
                  {g.amoeRulesUrl ? (
                    <View style={styles.amoeRow}>
                      <Text style={styles.amoe} numberOfLines={1}>
                        AMOE link ready
                      </Text>
                      <Pressable disabled={busy} onPress={() => void copyAmoeLink(g.amoeRulesUrl!)}>
                        <Text style={styles.actionTxt}>Copy</Text>
                      </Pressable>
                      <Pressable disabled={busy} onPress={() => void shareAmoeLink(g.amoeRulesUrl!)}>
                        <Text style={styles.actionTxt}>Share</Text>
                      </Pressable>
                      <Pressable
                        disabled={busy}
                        onPress={() =>
                          openAmoePreview(
                            g.amoeRulesUrl!,
                            g.amoeRulesSlug ?? promoEntrySlugFromUrl(g.amoeRulesUrl!),
                          )
                        }
                      >
                        <Text style={styles.actionTxt}>Preview</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <View style={styles.cardActions}>
                    {g.status === 'draft' ? (
                      <GiveawayActionButton
                        label="Open"
                        tone="green"
                        disabled={busy || createBusy}
                        onPress={() => runAction(g.id, 'open_entries')}
                      />
                    ) : null}
                    {g.status === 'entries_open' ? (
                      <>
                        <GiveawayActionButton
                          label="Close"
                          tone="amber"
                          disabled={busy || createBusy}
                          onPress={() => runAction(g.id, 'close_entries')}
                        />
                        <GiveawayActionButton
                          label="Draw"
                          tone="violet"
                          disabled={busy || createBusy}
                          onPress={() => runAction(g.id, 'draw')}
                        />
                      </>
                    ) : null}
                    {g.status === 'entries_closed' ? (
                      <GiveawayActionButton
                        label="Draw"
                        tone="violet"
                        disabled={busy || createBusy}
                        onPress={() => runAction(g.id, 'draw')}
                      />
                    ) : null}
                    {g.status !== 'drawn' ? (
                      <>
                        <GiveawayActionButton
                          label="Cancel"
                          tone="muted"
                          disabled={busy || createBusy}
                          onPress={() => runAction(g.id, 'cancel')}
                        />
                        <GiveawayActionButton
                          label="Delete"
                          tone="danger"
                          disabled={busy || createBusy}
                          onPress={() => runAction(g.id, 'delete')}
                        />
                      </>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  drawer: {
    maxHeight: '88%',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  tabTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  tabTxtActive: { color: colors.gold },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md, flexGrow: 1 },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  createBtn: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  createBtnTxt: { fontSize: 12, fontWeight: '800', color: '#6ee7b7', textAlign: 'center', lineHeight: 16 },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: 13, paddingVertical: spacing.lg },
  card: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardRow: { flexDirection: 'row', gap: spacing.sm },
  cardThumb: { width: 56, height: 56, borderRadius: radii.md, backgroundColor: 'rgba(0,0,0,0.35)' },
  cardBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  cardSub: { fontSize: 12, color: colors.textSecondary },
  cardMeta: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  entriesToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 2,
  },
  entriesToggleAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  entriesToggleTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6ee7b7',
    textTransform: 'uppercase',
  },
  timer: { fontSize: 11, fontWeight: '800', color: '#c4b5fd', marginTop: 2, fontVariant: ['tabular-nums'] },
  winner: { fontSize: 12, fontWeight: '700', color: colors.gold },
  amoeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  amoe: { fontSize: 10, color: colors.textMuted, flex: 1 },
  photoBox: {
    height: 120,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  photoBoxFilled: { borderStyle: 'solid' },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  photoPlaceholderTxt: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  photoUploading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnTxt: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  actionTxt: { fontSize: 11, fontWeight: '800', color: '#6ee7b7', textTransform: 'uppercase' },
  actionTxtMuted: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  actionTxtDanger: { fontSize: 11, fontWeight: '700', color: '#fca5a5' },
  form: { gap: spacing.sm },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: 14,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 13, color: colors.textSecondary },
  error: { fontSize: 12, color: '#fca5a5' },
  formActions: { flexDirection: 'row', gap: spacing.sm },
  secondaryBtn: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryBtnTxt: { color: colors.textSecondary, fontWeight: '700' },
  primaryBtn: {
    flex: 1,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryBtnTxt: { color: '#111', fontWeight: '800' },
});
