import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  submitReport,
  type ReportReason,
  type ReportTargetType,
} from '../../api/trustRepository';
import { colors, radii, spacing } from '../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  liveRoomId?: string;
  accessToken?: string;
  title?: string;
};

export function ReportSheet({
  visible,
  onClose,
  targetType,
  targetId,
  liveRoomId,
  accessToken,
  title = 'Report',
}: Props) {
  const [reason, setReason] = useState<ReportReason>('other');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => {
    setReason('other');
    setDescription('');
    setError(null);
    setDone(false);
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await submitReport({
      accessToken,
      targetType,
      targetId,
      reason,
      description,
      liveRoomId,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{done ? 'Report submitted' : title}</Text>
          {done ? (
            <>
              <Text style={styles.sub}>
                Our trust & safety team will review this report. You may be contacted if we need more information.
              </Text>
              <Pressable style={styles.primaryBtn} onPress={handleClose}>
                <Text style={styles.primaryBtnText}>Close</Text>
              </Pressable>
            </>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sub}>Reports are reviewed by moderators. False reports may affect your account.</Text>
              <Text style={styles.label}>Reason</Text>
              <View style={styles.reasonList}>
                {REPORT_REASONS.map((r) => (
                  <Pressable
                    key={r}
                    style={[styles.reasonChip, reason === r && styles.reasonChipActive]}
                    onPress={() => setReason(r)}
                  >
                    <Text style={[styles.reasonChipText, reason === r && styles.reasonChipTextActive]}>
                      {REPORT_REASON_LABELS[r]}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Details (optional)</Text>
              <TextInput
                value={description}
                onChangeText={(t) => setDescription(t.slice(0, 4000))}
                placeholder="What happened?"
                placeholderTextColor={colors.textMuted}
                multiline
                style={styles.input}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actions}>
                <Pressable style={styles.secondaryBtn} onPress={handleClose} disabled={busy}>
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.dangerBtn} onPress={() => void submit()} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.dangerBtnText}>Submit report</Text>}
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

export function ReportButton({
  targetType,
  targetId,
  liveRoomId,
  accessToken,
  label = 'Report',
}: {
  targetType: ReportTargetType;
  targetId: string;
  liveRoomId?: string;
  accessToken?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={styles.reportLink} onPress={() => setOpen(true)}>
        <Ionicons name="flag-outline" size={16} color={colors.textMuted} />
        <Text style={styles.reportLinkText}>{label}</Text>
      </Pressable>
      <ReportSheet
        visible={open}
        onClose={() => setOpen(false)}
        targetType={targetType}
        targetId={targetId}
        liveRoomId={liveRoomId}
        accessToken={accessToken}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  sub: { marginTop: spacing.sm, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  label: {
    marginTop: spacing.md,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  reasonList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
  reasonChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  reasonChipActive: { borderColor: colors.gold, backgroundColor: 'rgba(201,162,39,0.12)' },
  reasonChipText: { fontSize: 12, color: colors.textMuted },
  reasonChipTextActive: { color: colors.gold },
  input: {
    marginTop: spacing.sm,
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  error: { marginTop: spacing.sm, fontSize: 12, color: '#f87171' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md },
  secondaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.textPrimary, fontWeight: '600' },
  dangerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: '#b91c1c',
  },
  dangerBtnText: { color: '#fff', fontWeight: '700' },
  primaryBtn: {
    marginTop: spacing.lg,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  primaryBtnText: { color: '#0a0a0a', fontWeight: '700' },
  reportLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  reportLinkText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
});
