import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { colors, radii, spacing } from '../../../theme';
import { lc } from './liveConsoleTheme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

async function shareCopy(label: string, value: string) {
  try {
    await Share.share({ message: value, title: label });
  } catch {
    /* dismissed */
  }
}

export function StreamAdvancedPanel({
  streamConnected,
  serverUrl,
  streamKey,
  revealKey,
  onToggleReveal,
  onConnectSource,
  onRefresh,
  onRotateKey,
  busy,
  hasIngest,
  expandSignal,
}: {
  streamConnected: boolean;
  serverUrl: string | null;
  streamKey: string | null;
  revealKey: boolean;
  onToggleReveal: () => void;
  onConnectSource: () => void;
  onRefresh: () => void;
  onRotateKey: () => void;
  busy: 'provision' | 'rotate' | 'refresh' | null;
  hasIngest: boolean;
  /** Increment to open advanced settings from dock "Signal" tab. */
  expandSignal?: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (expandSignal && expandSignal > 0) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOpen(true);
    }
  }, [expandSignal]);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  const masked =
    streamKey && !revealKey
      ? `${'*'.repeat(Math.max(12, streamKey.length - 4))}${streamKey.slice(-4)}`
      : streamKey;

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.summary} onPress={toggle}>
        <View style={styles.summaryLeft}>
          <Ionicons name="videocam-outline" size={18} color={colors.gold} />
          <View>
            <Text style={styles.summaryTitle}>Broadcast source</Text>
            <Text style={styles.summarySub}>
              {streamConnected
                ? 'Your stream is reaching the vault'
                : 'Connect your streaming source to begin broadcasting'}
            </Text>
          </View>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>

      {!open ? (
        <Pressable
          style={[styles.connectBtn, busy === 'provision' && styles.disabled]}
          disabled={Boolean(busy)}
          onPress={onConnectSource}
        >
          {busy === 'provision' ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <Text style={styles.connectBtnTxt}>
              {hasIngest ? 'Refresh broadcast link' : 'Prepare broadcast link'}
            </Text>
          )}
        </Pressable>
      ) : null}

      {open ? (
        <View style={styles.advanced}>
          <Text style={lc.eyebrow}>Advanced stream settings</Text>
          <Text style={styles.hint}>
            Paste the server and key into Larix, OBS, or your encoder. Start broadcasting before you take the lane.
          </Text>

          <View style={styles.btnRow}>
            <Pressable
              style={[styles.btnGold, busy === 'provision' && styles.disabled]}
              disabled={Boolean(busy)}
              onPress={onConnectSource}
            >
              {busy === 'provision' ? (
                <ActivityIndicator color="#0a0a0a" />
              ) : (
                <Text style={styles.btnGoldTxt}>Prepare link</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.btnOutline, busy === 'refresh' && styles.disabled]}
              disabled={Boolean(busy)}
              onPress={onRefresh}
            >
              <Text style={styles.btnOutlineTxt}>Refresh status</Text>
            </Pressable>
          </View>

          {serverUrl ? (
            <>
              <Text style={styles.fieldLbl}>Server URL</Text>
              <Pressable style={styles.copyRow} onPress={() => void shareCopy('Server URL', serverUrl)}>
                <Text style={styles.copyVal} selectable numberOfLines={2}>
                  {serverUrl}
                </Text>
                <Ionicons name="share-outline" size={18} color={colors.gold} />
              </Pressable>
              {masked ? (
                <>
                  <Text style={styles.fieldLbl}>Stream key</Text>
                  <Pressable
                    style={styles.copyRow}
                    onPress={() => streamKey && void shareCopy('Stream key', streamKey)}
                  >
                    <Text style={styles.copyVal} selectable numberOfLines={1}>
                      {masked}
                    </Text>
                    <Ionicons name="share-outline" size={18} color={colors.gold} />
                  </Pressable>
                  <Pressable onPress={onToggleReveal} hitSlop={8}>
                    <Text style={styles.reveal}>{revealKey ? 'Hide key' : 'Reveal key'}</Text>
                  </Pressable>
                </>
              ) : null}
              <Pressable
                style={[styles.btnOutline, { marginTop: spacing.sm }, busy === 'rotate' && styles.disabled]}
                disabled={Boolean(busy)}
                onPress={onRotateKey}
              >
                <Text style={styles.btnOutlineTxt}>Rotate stream key</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.hint}>Prepare a broadcast link to see encoder settings.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    borderRadius: radii.lg,
    ...lc.glass,
    overflow: 'hidden',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  summaryLeft: { flex: 1, flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  summarySub: { fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 17 },
  connectBtn: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  connectBtnTxt: { fontWeight: '800', color: '#0a0a0a', fontSize: 14 },
  advanced: { padding: spacing.md, paddingTop: 0, gap: spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  btnRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  btnGold: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  btnGoldTxt: { fontWeight: '800', color: '#0a0a0a' },
  btnOutline: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  btnOutlineTxt: { fontWeight: '700', color: colors.textPrimary, fontSize: 13 },
  fieldLbl: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyVal: { flex: 1, fontSize: 12, color: colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  reveal: { color: colors.gold, fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.55 },
});
