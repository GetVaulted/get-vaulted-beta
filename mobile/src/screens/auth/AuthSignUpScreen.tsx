import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { checkUsernameAvailable, validateUsernameFormat } from '../../api/profilesRepository';
import { AuthPasswordField } from '../../components/auth/AuthPasswordField';
import { SocialAuthButtons, socialAuthErrorMessage } from '../../components/auth/SocialAuthButtons';
import { GetVaultedBrandMark } from '../../components/branding/GetVaultedBrandMark';
import { LegalConsentNote } from '../../components/legal/LegalConsentNote';
import { useAuth } from '../../auth/AuthContext';
import { AUTH_USER_MESSAGES } from '../../lib/authUserMessages';
import { enterGuestExploreAndOpenHome } from '../../navigation/enterGuestExploreFlow';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AuthSignUp'>;

type UsernameStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'invalid';

export function AuthSignUpScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { signUpWithPassword, signInWithGoogle, signInWithApple, loading: authLoading, enterGuestExplore } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameHint, setUsernameHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<'google' | 'apple' | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
  }, [username]);

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('LaunchIntro', { instantAuth: true });
  };

  const finishAuth = () => {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'HQ' } }] });
  };

  const onSocial = async (provider: 'google' | 'apple') => {
    setErr(null);
    setSocialBusy(provider);
    try {
      const result =
        provider === 'google'
          ? await signInWithGoogle({ persistSession: true })
          : await signInWithApple({ persistSession: true });
      if (result === 'success') finishAuth();
      else if (result === 'error') setErr(AUTH_USER_MESSAGES.socialSignInFailed);
    } catch (e) {
      setErr(socialAuthErrorMessage(e));
    } finally {
      setSocialBusy(null);
    }
  };

  const onSubmit = async () => {
    setErr(null);
    const em = email.trim();
    const u = username.trim();
    if (!em || !password || !confirmPassword || !u) {
      setErr('Fill in all fields.');
      return;
    }
    if (usernameStatus === 'checking') {
      setErr('Wait for the username check to finish.');
      return;
    }
    if (usernameStatus !== 'available') {
      setErr(usernameHint ?? 'Choose a valid, available username.');
      return;
    }
    if (password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErr('Passwords do not match.');
      return;
    }
    const again = await checkUsernameAvailable(u);
    if (!again.available) {
      setErr(again.message ?? 'That username was just taken. Pick another.');
      setUsernameStatus('unavailable');
      setUsernameHint(again.message ?? 'Taken.');
      return;
    }
    setBusy(true);
    try {
      const { needsEmailConfirmation } = await signUpWithPassword({
        email: em,
        password,
        username: u,
      });
      if (needsEmailConfirmation) {
        Alert.alert(
          'Confirm your email',
          AUTH_USER_MESSAGES.signUpConfirmEmail,
          [{ text: 'OK', onPress: () => navigation.replace('AuthLogin') }],
        );
        return;
      }
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'HQ' } }] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign-up failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.backRow} onPress={goBack} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>

        <View style={styles.brandBlock}>
          <GetVaultedBrandMark size="compact" />
        </View>

        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.sub}>Join the premium live collectible network.</Text>

        <SocialAuthButtons
          onGoogle={() => void onSocial('google')}
          onApple={() => void onSocial('apple')}
          busy={socialBusy}
          disabled={busy || authLoading}
          error={null}
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />

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

        <AuthPasswordField
          value={password}
          onChangeText={setPassword}
          placeholder="Password (8+ characters)"
          visible={passwordVisible}
          onToggleVisible={() => setPasswordVisible((v) => !v)}
          autoComplete="new-password"
        />
        <AuthPasswordField
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm password"
          visible={confirmVisible}
          onToggleVisible={() => setConfirmVisible((v) => !v)}
          autoComplete="new-password"
        />

        {err ? <Text style={styles.err}>{err}</Text> : null}

        <LegalConsentNote />

        <Pressable
          style={[styles.primary, (busy || authLoading) && { opacity: 0.7 }]}
          disabled={busy || authLoading}
          onPress={() => void onSubmit()}
        >
          {busy ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.primaryTxt}>Create Account</Text>
          )}
        </Pressable>

        <Pressable style={styles.link} onPress={() => navigation.navigate('AuthLogin')}>
          <Text style={styles.linkTxt}>Already have an account? Sign In</Text>
        </Pressable>

        <Pressable
          style={styles.exploreBtn}
          onPress={() => enterGuestExploreAndOpenHome(enterGuestExplore)}
        >
          <Text style={styles.exploreBtnTxt}>Explore Get Vaulted</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050505', paddingHorizontal: spacing.lg },
  scroll: { paddingBottom: spacing.xxxl, gap: spacing.md },
  backRow: { alignSelf: 'flex-start', paddingVertical: spacing.sm, marginBottom: spacing.xs },
  brandBlock: { alignItems: 'center', marginBottom: spacing.md },
  title: { ...typography.title, color: colors.textPrimary, fontSize: 24, marginTop: spacing.sm },
  sub: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: spacing.sm },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    fontSize: 16,
  },
  usernameMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: -spacing.sm,
    marginBottom: spacing.xs,
    minHeight: 22,
  },
  usernameIcon: { marginTop: 1 },
  usernameHint: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  usernameHintOk: { color: '#8fdf9f' },
  usernameHintBad: { color: '#f0a8a8' },
  usernameHintMuted: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  err: { color: '#f0a8a8', fontSize: 13 },
  primary: {
    backgroundColor: colors.gold,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
  link: { paddingVertical: spacing.lg, alignItems: 'center' },
  linkTxt: { color: colors.gold, fontWeight: '700', fontSize: 15 },
  exploreBtn: {
    marginTop: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  exploreBtnTxt: { color: colors.textPrimary, fontWeight: '700', fontSize: 15 },
});
