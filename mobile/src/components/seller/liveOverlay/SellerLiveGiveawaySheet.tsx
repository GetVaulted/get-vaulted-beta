import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
  deleteLiveGiveaway,
  patchLiveGiveaway,
  promoEntrySlugFromUrl,
} from '../../../api/liveGiveawayRepository';
import { openPromoEntry } from '../../../navigation/openPromoEntry';
import { useGiveawayCountdown } from '../../../hooks/useGiveawayCountdown';
import { colors, radii, spacing } from '../../../theme';

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

export function SellerLiveGiveawaySheet({
  visible,
  onClose,
  accessToken,
  roomId,
  giveaways,
  busy,
  onRefresh,
  onBusyChange,
  onToast,
}: {
  visible: boolean;
  onClose: () => void;
  accessToken: string;
  roomId: string;
  giveaways: LiveGiveawayRow[];
  busy: boolean;
  onRefresh: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onToast?: (message: string) => void;
}) {
  const insets = useSafeAreaInsets();
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

  const rows = useMemo(() => giveaways.filter((g) => g.kind === lane), [giveaways, lane]);

  const resetForm = useCallback(() => {
    setTitle('');
    setPrizeDescription('');
    setRulesText('');
    setOpenOnCreate(true);
    setFormError(null);
    setCreating(false);
    setImageUri(null);
    setImageUrl(null);
    setImageError(null);
  }, []);

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
    async (id: string, action: 'open_entries' | 'close_entries' | 'cancel' | 'draw' | 'delete') => {
      onBusyChange(true);
      try {
        if (action === 'delete') {
          await deleteLiveGiveaway(accessToken, roomId, id);
        } else {
          await patchLiveGiveaway(accessToken, roomId, id, action);
        }
        await onRefresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Action failed.';
        setFormError(msg);
      } finally {
        onBusyChange(false);
      }
    },
    [accessToken, onBusyChange, onRefresh, roomId],
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
    onBusyChange(true);
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
      onBusyChange(false);
    }
  }, [
    accessToken,
    lane,
    imageUrl,
    onToast,
    onBusyChange,
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
        <View style={[styles.drawer, { paddingBottom: insets.bottom + spacing.lg }]}>
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
              const label = t === 'open' ? 'Giveaway' : 'Buyers givvy';
              return (
                <Pressable
                  key={t}
                  onPress={() => {
                    setLane(t);
                    resetForm();
                  }}
                  style={[styles.tab, t === 'buyers' && styles.tabWide, active && styles.tabActive]}
                >
                  <Text style={[styles.tabTxt, active && styles.tabTxtActive]} numberOfLines={2}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
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
                  placeholder="Giveaway title"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                <TextInput
                  value={prizeDescription}
                  onChangeText={setPrizeDescription}
                  placeholder="Prize description"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                {lane === 'buyers' ? (
                  <TextInput
                    value={rulesText}
                    onChangeText={setRulesText}
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
                  <Pressable style={styles.secondaryBtn} onPress={resetForm}>
                    <Text style={styles.secondaryBtnTxt}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.primaryBtn} disabled={busy} onPress={() => void handleCreate()}>
                    {busy ? <ActivityIndicator color="#111" /> : <Text style={styles.primaryBtnTxt}>Create</Text>}
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
                      {g.prizeDescription ? <Text style={styles.cardSub}>{g.prizeDescription}</Text> : null}
                      <Text style={styles.cardMeta}>
                        {statusLabel(g.status)} · {g.entryCount} entries
                      </Text>
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
                      <Pressable disabled={busy} onPress={() => void runAction(g.id, 'open_entries')}>
                        <Text style={styles.actionTxt}>Open</Text>
                      </Pressable>
                    ) : null}
                    {g.status === 'entries_open' ? (
                      <>
                        <Pressable disabled={busy} onPress={() => void runAction(g.id, 'close_entries')}>
                          <Text style={styles.actionTxt}>Close</Text>
                        </Pressable>
                        <Pressable disabled={busy} onPress={() => void runAction(g.id, 'draw')}>
                          <Text style={styles.actionTxt}>Draw</Text>
                        </Pressable>
                      </>
                    ) : null}
                    {g.status === 'entries_closed' ? (
                      <Pressable disabled={busy} onPress={() => void runAction(g.id, 'draw')}>
                        <Text style={styles.actionTxt}>Draw</Text>
                      </Pressable>
                    ) : null}
                    {g.status !== 'drawn' ? (
                      <>
                        <Pressable disabled={busy} onPress={() => void runAction(g.id, 'cancel')}>
                          <Text style={styles.actionTxtMuted}>Cancel</Text>
                        </Pressable>
                        <Pressable disabled={busy} onPress={() => void runAction(g.id, 'delete')}>
                          <Text style={styles.actionTxtDanger}>Delete</Text>
                        </Pressable>
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
    maxHeight: '78%',
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
  tabWide: {
    flex: 1.35,
    paddingHorizontal: spacing.md,
  },
  tabActive: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  tabTxt: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textAlign: 'center', lineHeight: 16 },
  tabTxtActive: { color: colors.gold },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
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
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
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
