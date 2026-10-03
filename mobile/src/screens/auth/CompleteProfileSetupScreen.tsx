import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  completeProfileSetup,
  fetchProfileSetupStatus,
} from '../../api/profileSetupRepository';
import { checkUsernameAvailable, validateUsernameFormat } from '../../api/profilesRepository';
import { GetVaultedBrandMark } from '../../components/branding/GetVaultedBrandMark';
import { useAuth } from '../../auth/AuthContext';
import { navigateAfterAccountReady } from '../../navigation/navigateAfterSignIn';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CompleteProfileSetup'>;

type UsernameStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'invalid';

export function CompleteProfileSetupScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const accessToken = session?.access_token ?? '';
  const [username, setUsername] = useState('');
  const [referralCode, setReferralCode] = useState(route.params?.ref ?? '');
  const [referralLocked, setReferralLocked] = useState(false);
  const [suggestedUsername, setSuggestedUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameHint, setUsernameHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchProfileSetupStatus(accessToken);
        if (cancelled) return;
        if (!status.needsSetup) {
          await navigateAfterAccountReady(navigation, 'signup');
          return;
        }
        setUsername(status.username);
        setSuggestedUsername(status.username);
        setReferralLocked(status.referralAlreadySet);
        if (status.referralAlreadySet) setReferralCode('');
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Could not load your profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, navigation]);

  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameStatus('idle');
      setUsernameHint(null);
      return;
    }
    const formatErr = validateUsernameFormat(trimmed);
    if (formatErr) {
      setUsernameStatus('invalid');
      setUsernameHint(formatErr);
      return;
    }
    if (trimmed.toLowerCase() === suggestedUsername.trim().toLowerCase()) {
      setUsernameStatus('available');
      setUsernameHint('You can keep this username or choose another.');
      return;
    }
    setUsernameStatus('checking');
    setUsernameHint('Checking availability…');
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        const result = await checkUsernameAvailable(trimmed);
        if (cancelled || username.trim() !== trimmed) return;
        if (!result.available) {
          setUsernameStatus('unavailable');
          setUsernameHint(result.message ?? 'That username is taken.');
        } else {
          setUsernameStatus('available');
          setUsernameHint('Username is available.');
        }
      })();
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username, suggestedUsername]);

  const finishHome = async () => {
    await navigateAfterAccountReady(navigation, 'signup');
  };

  const onSubmit = async () => {
    setErr(null);
    const u = username.trim();
    if (!u) {
      setErr('Choose a username.');
      return;
    }
    const keepingSuggested = u.toLowerCase() === suggestedUsername.trim().toLowerCase();
    if (usernameStatus === 'checking') {
      setErr('Wait for the username check to finish.');
      return;
    }
    if (usernameStatus !== 'available' && !keepingSuggested) {
      setErr(usernameHint ?? 'Choose a valid, available username.');
      return;
    }
    if (!accessToken) {
      setErr('Your session expired. Sign in again.');
      return;
    }
    if (u.toLowerCase() !== suggestedUsername.trim().toLowerCase()) {
      const again = await checkUsernameAvailable(u);
      if (!again.available) {
        setErr(again.message ?? 'That username was just taken. Pick another.');
        setUsernameStatus('unavailable');
        setUsernameHint(again.message ?? 'Taken.');
        return;
      }
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setBusy(true);
    try {
      await completeProfileSetup({
        accessToken,
        username: u,
        referralCode: referralLocked ? undefined : referralCode.trim() || undefined,
      });
      await finishHome();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.brandBlock}>
          <GetVaultedBrandMark size="compact" />
        </View>

        <LinearGradient
          colors={['rgba(212,175,55,0.14)', 'rgba(10,10,12,0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <Text style={styles.heroEyebrow}>GET VAULTED</Text>
          <Text style={styles.title}>Choose your username</Text>
          <Text style={styles.sub}>
            Pick a public username to finish setting up your account. You can change it later, but only once every 60 days
            and not while you have open orders.
          </Text>
        </LinearGradient>

        {loading ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
        ) : (
          <View style={styles.formCard}>
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              value={username}
              onChangeText={setUsername}
            />
            <View style={styles.usernameMetaRow}>
              {usernameStatus === 'checking' ? <ActivityIndicator size="small" color={colors.gold} /> : null}
              {usernameStatus === 'available' ? (
                <Ionicons name="checkmark-circle" size={18} color="#6ecf8e" style={styles.usernameIcon} />
              ) : null}
              {usernameStatus === 'unavailable' || usernameStatus === 'invalid' ? (
                <Ionicons name="close-circle" size={18} color="#e08080" style={styles.usernameIcon} />
              ) : null}
              {usernameHint ? (
                <Text
                  style={[
                    styles.usernameHint,
                    usernameStatus === 'available' && styles.usernameHintOk,
                    (usernameStatus === 'unavailable' || usernameStatus === 'invalid') && styles.usernameHintBad,
                  ]}
                >
                  {usernameHint}
                </Text>
              ) : (
                <Text style={styles.usernameHintMuted}>3–20 characters: letters, numbers, underscores.</Text>
              )}
            </View>

            {!referralLocked ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Referral username (optional)"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={referralCode}
                  onChangeText={setReferralCode}
                />
                {referralCode.trim() ? (
                  <Text style={styles.usernameHintMuted}>
                    Referred by a friend — you&apos;ll both get referral credit after your first order.
                  </Text>
                ) : null}
              </>
            ) : null}

            {err ? <Text style={styles.err}>{err}</Text> : null}

            <Pressable style={[styles.primary, busy && styles.primaryBusy]} disabled={busy} onPress={() => void onSubmit()}>
              <LinearGradient
                colors={busy ? ['#8a7340', '#6d5c32'] : [colors.gold, '#E8D48B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryGrad}
              >
                {busy ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.primaryTxt}>Continue</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  brandBlock: { alignItems: 'center', marginBottom: spacing.md },
  heroCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.22)',
    marginBottom: spacing.lg,
  },
  heroEyebrow: { ...typography.micro, color: colors.gold, letterSpacing: 2, marginBottom: spacing.xs },
  title: { ...typography.title, color: colors.textPrimary, fontSize: 24, marginBottom: spacing.sm },
  sub: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  formCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    fontSize: 16,
  },
  usernameMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: -spacing.xs },
  usernameIcon: { marginRight: 2 },
  usernameHint: { flex: 1, color: colors.textMuted, fontSize: 13 },
  usernameHintOk: { color: '#6ecf8e' },
  usernameHintBad: { color: '#e08080' },
  usernameHintMuted: { color: colors.textMuted, fontSize: 13 },
  err: { color: '#e08080', fontSize: 14 },
  primary: { borderRadius: radii.md, overflow: 'hidden', marginTop: spacing.sm },
  primaryBusy: { opacity: 0.85 },
  primaryGrad: { paddingVertical: spacing.lg, alignItems: 'center' },
  primaryTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
});
