import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { patchLiveRoomShowNotes } from '../../api/liveHostRepository';
import { fetchLiveRoomPublicById } from '../../api/liveRoomsRepository';
import {
  LIVE_SHOW_NOTES_MAX_CHARS,
  normalizeLiveShowNotes,
} from '../../lib/liveShowNotes';
import { colors, radii, spacing } from '../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  /** Seller edit mode requires accessToken. */
  mode: 'read' | 'edit';
  accessToken?: string;
  /** Seed text before a fresh fetch (seller local / buyer stream). */
  initialNotes?: string | null;
  onSaved?: (notes: string) => void;
  /** Fired whenever notes are loaded or refreshed from the server. */
  onNotesLoaded?: (notes: string) => void;
  onToast?: (message: string) => void;
};

/**
 * Show notes panel — dark “show brief” sheet (not a post-it).
 * Sellers edit; buyers read. Backed by live room `description`.
 */
export function LiveShowNotesSheet({
  visible,
  onClose,
  roomId,
  mode,
  accessToken,
  initialNotes,
  onSaved,
  onNotesLoaded,
  onToast,
}: Props) {
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const onNotesLoadedRef = useRef(onNotesLoaded);
  onNotesLoadedRef.current = onNotesLoaded;

  useEffect(() => {
    if (!visible) return;
    const seed = normalizeLiveShowNotes(initialNotes);
    setNotes(seed);
    setDraft(seed);
    let cancelled = false;
    setLoading(true);
    void fetchLiveRoomPublicById(roomId)
      .then((row) => {
        if (cancelled) return;
        const next = normalizeLiveShowNotes(row?.showNotes);
        setNotes(next);
        setDraft(next);
        onNotesLoadedRef.current?.(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, roomId, initialNotes]);

  const save = async () => {
    if (!accessToken?.trim() || mode !== 'edit') return;
    const next = draft.trim().slice(0, LIVE_SHOW_NOTES_MAX_CHARS);
    setSaving(true);
    try {
      await patchLiveRoomShowNotes(accessToken, roomId, next);
      setNotes(next);
      setDraft(next);
      onSaved?.(next);
      onToast?.(next ? 'Show notes updated.' : 'Show notes cleared.');
      onClose();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Could not save show notes.');
    } finally {
      setSaving(false);
    }
  };

  const dirty = mode === 'edit' && draft.trim() !== notes.trim();
  const remaining = LIVE_SHOW_NOTES_MAX_CHARS - draft.length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss show notes" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm }]}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={styles.accentBar} />
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>SHOW BRIEF</Text>
              <Text style={styles.title}>Show notes</Text>
              <Text style={styles.subtitle}>
                {mode === 'edit'
                  ? 'Buyers open this from the right rail during your show.'
                  : 'Notes from the host for this show.'}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.gold} />
            </View>
          ) : mode === 'edit' ? (
            <>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={(t) => setDraft(t.slice(0, LIVE_SHOW_NOTES_MAX_CHARS))}
                placeholder="Shipping rules, pull order, giveaway details, house rules…"
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
                maxLength={LIVE_SHOW_NOTES_MAX_CHARS}
                editable={!saving}
              />
              <Text style={styles.counter}>{remaining} left</Text>
              <Pressable
                style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDisabled]}
                onPress={() => void save()}
                disabled={!dirty || saving}
                accessibilityLabel="Save show notes"
              >
                {saving ? (
                  <ActivityIndicator color={colors.gold} />
                ) : (
                  <Text style={styles.saveBtnTxt}>Save notes</Text>
                )}
              </Pressable>
            </>
          ) : notes ? (
            <ScrollView style={styles.readScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.readBody}>{notes}</Text>
            </ScrollView>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="document-text-outline" size={28} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No show notes yet</Text>
              <Text style={styles.emptyBody}>The host hasn’t posted notes for this show.</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: '#0c0e12',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.22)',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '78%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 2,
    backgroundColor: colors.gold,
  },
  headerCopy: { flex: 1 },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: colors.gold,
    marginBottom: 2,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  subtitle: { marginTop: 4, fontSize: 13, color: colors.textMuted },
  loadingBox: { paddingVertical: spacing.xl, alignItems: 'center' },
  input: {
    minHeight: 160,
    maxHeight: 280,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  counter: {
    alignSelf: 'flex-end',
    marginTop: 6,
    marginBottom: spacing.sm,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  saveBtn: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.12)',
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnTxt: { fontSize: 14, fontWeight: '800', color: colors.gold },
  readScroll: { maxHeight: 360 },
  readBody: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.textPrimary,
    paddingBottom: spacing.md,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
