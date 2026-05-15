import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
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
import { useCreateListingDraft } from './CreateListingDraftContext';
import { colors, radii, spacing, typography } from '../theme';

const QUICK_PROMPTS = [
  'Write a better description',
  'Make this sound more premium',
  'Suggest price',
  'Add SEO tags',
  'Estimate shipping weight',
  'Create live auction copy',
  'Make this trade-friendly',
];

export function ListingAssistantFAB({ bottomOffset = 96 }: { bottomOffset?: number }) {
  const insets = useSafeAreaInsets();
  const { assistantMessages, sendAssistantPrompt } = useCreateListingDraft();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const onSend = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    sendAssistantPrompt(t);
    setDraft('');
  }, [draft, sendAssistantPrompt]);

  return (
    <>
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + bottomOffset }]}
        onPress={() => setOpen(true)}
        accessibilityLabel="Open listing assistant"
      >
        <Ionicons name="sparkles" size={22} color={colors.background} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.scrim} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.sheetHead}>
              <View>
                <Text style={styles.sheetK}>Smart listing assistant</Text>
                <Text style={styles.sheetTitle}>Vault co-pilot</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView style={styles.thread} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
              {assistantMessages.map((item) => (
                <View
                  key={item.id}
                  style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAsst]}
                >
                  <Text style={styles.bubbleRole}>{item.role === 'user' ? 'You' : 'Assistant'}</Text>
                  <Text style={styles.bubbleTxt}>{item.text}</Text>
                </View>
              ))}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {QUICK_PROMPTS.map((q) => (
                <Pressable key={q} style={styles.chip} onPress={() => sendAssistantPrompt(q)}>
                  <Text style={styles.chipTxt} numberOfLines={1}>
                    {q}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.compose}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask anything about this listing…"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                multiline
              />
              <Pressable style={styles.send} onPress={onSend}>
                <Ionicons name="arrow-up" size={22} color={colors.background} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.lg,
    maxHeight: '72%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sheetK: { ...typography.micro, color: colors.gold, letterSpacing: 0.8 },
  sheetTitle: { ...typography.title, fontSize: 20, color: colors.textPrimary },
  thread: { maxHeight: 280 },
  bubble: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleUser: { backgroundColor: 'rgba(212,175,55,0.08)', alignSelf: 'flex-end', maxWidth: '92%' },
  bubbleAsst: { backgroundColor: colors.surface, alignSelf: 'stretch' },
  bubbleRole: { color: colors.textMuted, fontSize: 10, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' },
  bubbleTxt: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  chipTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: 15,
    backgroundColor: colors.background,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
