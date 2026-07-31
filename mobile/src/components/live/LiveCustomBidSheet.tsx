import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LIVE_CUSTOM_BID_DEFAULT_MODE,
  LIVE_CUSTOM_BID_MODE_COPY,
  resolveLiveCustomBidPayload,
  type LiveCustomBidMode,
  type LiveCustomBidPayload,
} from '../../lib/liveCustomBid';
import { resolveLiveBidFailureDisplay } from '../../lib/liveBidUserErrors';
import { colors, radii, spacing } from '../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  minNextBidUsd: number;
  currentBidUsd?: number | null;
  /** When false, reserve/max proxy is unavailable (marketplace listing lots). */
  reserveSupported?: boolean;
  busy?: boolean;
  onSubmit: (payload: LiveCustomBidPayload) => void | Promise<void>;
};

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function LiveCustomBidSheet({
  visible,
  onClose,
  minNextBidUsd,
  currentBidUsd,
  reserveSupported = true,
  busy = false,
  onSubmit,
}: Props) {
  const insets = useSafeAreaInsets();
  const [amountDraft, setAmountDraft] = useState('');
  const [mode, setMode] = useState<LiveCustomBidMode>(LIVE_CUSTOM_BID_DEFAULT_MODE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setAmountDraft('');
    setMode(reserveSupported ? LIVE_CUSTOM_BID_DEFAULT_MODE : 'exact');
    setError(null);
  }, [visible, minNextBidUsd, reserveSupported]);

  // Keep the draft/error in sync when the live min advances while the sheet is open (e.g. outbid).
  useEffect(() => {
    if (!visible) return;
    setError(null);
  }, [visible, minNextBidUsd]);

  const effectiveMode: LiveCustomBidMode =
    reserveSupported && mode === 'reserve' ? 'reserve' : 'exact';
  const modeCopy =
    effectiveMode === 'reserve' ? LIVE_CUSTOM_BID_MODE_COPY.reserve : LIVE_CUSTOM_BID_MODE_COPY.exact;

  const submit = async () => {
    const entered = Number.parseFloat(amountDraft.trim());
    try {
      const payload = resolveLiveCustomBidPayload({
        mode: effectiveMode,
        enteredUsd: entered,
        minNextBidUsd,
      });
      setError(null);
      await onSubmit(payload);
    } catch (e) {
      setError(resolveLiveBidFailureDisplay(e).message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Custom bid</Text>
          <Pressable onPress={onClose} hitSlop={12} disabled={busy}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.helper}>
            {currentBidUsd != null && Number.isFinite(currentBidUsd)
              ? `Current bid ${fmtUsd(currentBidUsd)} · next bid ${fmtUsd(minNextBidUsd)}. Enter your max below (default), or switch to Exact to jump the hammer.`
              : `Next bid ${fmtUsd(minNextBidUsd)}. Enter your max below (default), or switch to Exact to jump the hammer.`}
          </Text>

          <Text style={styles.label}>Amount</Text>
          <View style={styles.amountRow}>
            <Text style={styles.dollar}>$</Text>
            <TextInput
              value={amountDraft}
              onChangeText={setAmountDraft}
              editable={!busy}
              keyboardType="decimal-pad"
              placeholder={String(minNextBidUsd)}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              accessibilityLabel="Custom bid amount"
            />
          </View>

          <View style={styles.modeRow}>
            <View style={styles.modeCopy}>
              <Text style={styles.modeLabel}>{modeCopy.label}</Text>
              <Text style={styles.modeDescription}>{modeCopy.description}</Text>
              {!reserveSupported ? (
                <Text style={styles.modeNote}>Max bid is not available for marketplace listing lots.</Text>
              ) : (
                <Text style={styles.modeNote}>
                  {effectiveMode === 'reserve'
                    ? 'Recommended — you only pay one increment above the competition.'
                    : 'Exact places your full amount immediately.'}
                </Text>
              )}
            </View>
            <Switch
              value={effectiveMode === 'reserve'}
              onValueChange={(v) => setMode(v ? 'reserve' : 'exact')}
              disabled={busy || !reserveSupported}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: colors.gold }}
              thumbColor="#fff"
              accessibilityLabel="Toggle max bid mode"
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.submit, (busy || !amountDraft.trim()) && styles.submitOff]}
            disabled={busy || !amountDraft.trim()}
            onPress={() => void submit()}
          >
            {busy ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={styles.submitTxt}>
                {effectiveMode === 'reserve' ? 'Set max bid' : 'Place exact bid'}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '900', color: colors.textPrimary },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm },
  helper: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  dollar: { fontSize: 16, fontWeight: '800', color: colors.textSecondary, marginRight: 4 },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  modeCopy: { flex: 1, gap: 4 },
  modeLabel: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  modeDescription: { fontSize: 12, lineHeight: 16, color: colors.textSecondary },
  modeNote: { fontSize: 11, lineHeight: 15, color: colors.textMuted, marginTop: 2 },
  error: { fontSize: 12, fontWeight: '700', color: '#f87171', marginTop: spacing.xs },
  submit: {
    marginTop: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
  },
  submitOff: { opacity: 0.6 },
  submitTxt: { fontSize: 14, fontWeight: '900', color: colors.background },
});
