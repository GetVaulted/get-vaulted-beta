import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import {
  enrollTotpFactor,
  getVerifiedTotpFactor,
  unenrollTotpFactor,
  verifyTotpCode,
  type TotpEnrollment,
} from '../../lib/mfaService';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TwoFactorAuth'>;

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'enrolling'; enrollment: TotpEnrollment }
  | { kind: 'on'; factorId: string; createdAt: string };

function formatEnabledDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export function TwoFactorAuthScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const factor = await getVerifiedTotpFactor();
      setState(factor ? { kind: 'on', factorId: factor.id, createdAt: factor.createdAt } : { kind: 'off' });
    } catch {
      setState({ kind: 'off' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onStartEnroll = async () => {
    setBusy(true);
    setError(null);
    try {
      const enrollment = await enrollTotpFactor();
      setCode('');
      setState({ kind: 'enrolling', enrollment });
    } catch (e) {
      Alert.alert('Could not start setup', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onConfirmEnroll = async (enrollment: TotpEnrollment) => {
    if (code.trim().length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyTotpCode(enrollment.factorId, code);
      await refresh();
      Alert.alert('Two-factor authentication is on', "You'll be asked for a code like this each time you sign in.");
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code — try again.');
    } finally {
      setBusy(false);
    }
  };

  const onCancelEnroll = () => {
    setError(null);
    setState({ kind: 'off' });
  };

  const onDisable = (factorId: string) => {
    Alert.alert(
      'Turn off two-factor authentication?',
      'Your account will only be protected by your password.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await unenrollTotpFactor(factorId);
                await refresh();
              } catch (e) {
                Alert.alert('Could not turn off', e instanceof Error ? e.message : 'Try again.');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Two-factor authentication" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {state.kind === 'loading' ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
        ) : state.kind === 'on' ? (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={styles.statusIcon}>
                <Ionicons name="shield-checkmark" size={20} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>Two-factor authentication is on</Text>
                <Text style={styles.statusSub}>Enabled {formatEnabledDate(state.createdAt)}</Text>
              </View>
            </View>
            <Text style={styles.hint}>
              Every sign-in will ask for a 6-digit code from your authenticator app, in addition to your password.
            </Text>
            <Pressable
              style={[styles.ghostBtn, busy && styles.btnOff]}
              disabled={busy}
              onPress={() => onDisable(state.factorId)}
            >
              <Text style={styles.ghostBtnTxt}>Turn off two-factor authentication</Text>
            </Pressable>
          </View>
        ) : state.kind === 'enrolling' ? (
          <View style={styles.card}>
            <Text style={styles.stepTitle}>1. Scan this with your authenticator app</Text>
            <Text style={styles.hint}>Google Authenticator, Authy, 1Password, or any TOTP app works.</Text>
            <View style={styles.qrWrap}>
              <SvgXml xml={state.enrollment.qrSvgMarkup} width={200} height={200} />
            </View>
            <Text style={styles.hint}>Can't scan it? Enter this code manually:</Text>
            <View style={styles.secretRow}>
              <Text style={styles.secretTxt} selectable>
                {state.enrollment.secret}
              </Text>
            </View>

            <Text style={[styles.stepTitle, { marginTop: spacing.lg }]}>2. Enter the 6-digit code</Text>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/[^0-9]/g, '').slice(0, 6));
                setError(null);
              }}
              placeholder="123456"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
            />
            {error ? <Text style={styles.err}>{error}</Text> : null}

            <Pressable
              style={[styles.primaryBtn, (busy || code.trim().length < 6) && styles.btnOff]}
              disabled={busy || code.trim().length < 6}
              onPress={() => void onConfirmEnroll(state.enrollment)}
            >
              {busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryBtnTxt}>Confirm and enable</Text>}
            </Pressable>
            <Pressable style={styles.link} onPress={onCancelEnroll} disabled={busy}>
              <Text style={styles.linkTxt}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={[styles.statusIcon, styles.statusIconOff]}>
                <Ionicons name="shield-outline" size={20} color={colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>Two-factor authentication is off</Text>
                <Text style={styles.statusSub}>Add a second step at sign-in using an authenticator app.</Text>
              </View>
            </View>
            <Pressable style={[styles.primaryBtn, busy && styles.btnOff]} disabled={busy} onPress={() => void onStartEnroll()}>
              {busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryBtnTxt}>Enable two-factor authentication</Text>}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { paddingBottom: spacing.xxl },
  card: {
    marginTop: spacing.md,
    borderRadius: radii.lg,
    padding: spacing.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(88,196,141,0.12)',
  },
  statusIconOff: { backgroundColor: 'rgba(255,255,255,0.06)' },
  statusTitle: { ...typography.title, color: colors.textPrimary, fontSize: 16 },
  statusSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  stepTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
  qrWrap: {
    alignSelf: 'center',
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: '#fff',
  },
  secretRow: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: spacing.md,
  },
  secretTxt: { color: colors.textPrimary, fontSize: 14, fontVariant: ['tabular-nums'], letterSpacing: 1, textAlign: 'center' },
  codeInput: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: spacing.md,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.05)',
    fontSize: 20,
    letterSpacing: 6,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  err: { color: '#f0a8a8', fontSize: 13 },
  primaryBtn: {
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  primaryBtnTxt: { color: colors.background, fontWeight: '800', fontSize: 15 },
  ghostBtn: {
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.live,
    alignItems: 'center',
  },
  ghostBtnTxt: { color: colors.live, fontWeight: '700', fontSize: 14 },
  btnOff: { opacity: 0.6 },
  link: { paddingVertical: spacing.sm, alignItems: 'center' },
  linkTxt: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
});
