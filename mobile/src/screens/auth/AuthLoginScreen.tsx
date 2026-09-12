import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthPasswordField } from '../../components/auth/AuthPasswordField';
import { SocialAuthButtons, socialAuthErrorMessage } from '../../components/auth/SocialAuthButtons';
import { GetVaultedBrandMark } from '../../components/branding/GetVaultedBrandMark';
import { LegalConsentNote } from '../../components/legal/LegalConsentNote';
import { useAuth } from '../../auth/AuthContext';
import { AUTH_USER_MESSAGES } from '../../lib/authUserMessages';
import {
  getRememberMePreference,
  loadRememberedEmail,
  persistRememberMeCredentials,
} from '../../lib/rememberMeCredentials';
import { getKeepMeLoggedInPreference } from '../../lib/authSessionStorage';
import { enterGuestExploreAndOpenHome } from '../../navigation/enterGuestExploreFlow';
import { navigateAfterSignIn } from '../../navigation/navigateAfterSignIn';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AuthLogin'>;

export function AuthLoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { signInWithPassword, signInWithGoogle, signInWithApple, requestPasswordReset, loading: authLoading, enterGuestExplore } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<'google' | 'apple' | null>(null);

  useEffect(() => {
    void (async () => {
      // SECURITY: only the email is ever remembered (never the password) — see rememberMeCredentials.ts.
      const savedEmail = await loadRememberedEmail();
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
        return;
      }
      const rememberPref = await getRememberMePreference();
      setRememberMe(rememberPref || (await getKeepMeLoggedInPreference()));
    })();
  }, []);

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('LaunchIntro', { instantAuth: true });
  };

  const onSocial = async (provider: 'google' | 'apple') => {
    setErr(null);
    setSocialBusy(provider);
    try {
      const result =
        provider === 'google'
          ? await signInWithGoogle({ persistSession: rememberMe })
          : await signInWithApple({ persistSession: rememberMe });
      if (result === 'success') await navigateAfterSignIn(navigation);
      else if (result === 'error') setErr(AUTH_USER_MESSAGES.socialSignInFailed);
    } catch (e) {
      setErr(socialAuthErrorMessage(e));
    } finally {
      setSocialBusy(null);
    }
  };

  const onSubmit = async () => {
    setErr(null);
    setBusy(true);
    try {
      await signInWithPassword(email, password, { persistSession: rememberMe });
      await persistRememberMeCredentials(rememberMe, email);
      await navigateAfterSignIn(navigation, { preferGoBack: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : AUTH_USER_MESSAGES.signInInvalidCredentials);
    } finally {
      setBusy(false);
    }
  };

  const onForgotSend = async () => {
    const em = forgotEmail.trim() || email.trim();
    if (!em) {
      Alert.alert('Email required', 'Enter the email you used to register.');
      return;
    }
    setForgotBusy(true);
    try {
      await requestPasswordReset(em);
      setForgotOpen(false);
      Alert.alert('Check your email', AUTH_USER_MESSAGES.passwordResetSent);
    } catch (e) {
      Alert.alert('Could not send reset', e instanceof Error ? e.message : 'Error');
    } finally {
      setForgotBusy(false);
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
        <Pressable style={styles.backRow} onPress={goBack} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>

        <View style={styles.brandBlock}>
          <GetVaultedBrandMark size="compact" />
        </View>

        <Text style={styles.title}>Sign In</Text>
        <Text style={styles.sub}>Welcome back to your vault.</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <AuthPasswordField
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          visible={passwordVisible}
          onToggleVisible={() => setPasswordVisible((v) => !v)}
          autoComplete="password"
        />

        <Pressable
          style={styles.keepRow}
          onPress={() => setRememberMe((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: rememberMe }}
          accessibilityLabel="Remember me"
        >
          <Ionicons
            name={rememberMe ? 'checkbox' : 'square-outline'}
            size={22}
            color={rememberMe ? colors.gold : colors.textMuted}
          />
          <Text style={styles.keepLabel}>Remember me</Text>
        </Pressable>

        <Pressable style={styles.forgotWrap} onPress={() => { setForgotEmail(email); setForgotOpen(true); }}>
          <Text style={styles.forgotTxt}>Forgot password?</Text>
        </Pressable>

        {err ? <Text style={styles.err}>{err}</Text> : null}

        <Pressable
          style={[styles.primary, (busy || authLoading) && { opacity: 0.7 }]}
          disabled={busy || authLoading}
          onPress={() => void onSubmit()}
        >
          {busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryTxt}>Sign In</Text>}
        </Pressable>

        <SocialAuthButtons
          onGoogle={() => void onSocial('google')}
          onApple={() => void onSocial('apple')}
          busy={socialBusy}
          disabled={busy || authLoading}
          error={null}
        />

        <Pressable style={styles.link} onPress={() => navigation.navigate('AuthSignUp')}>
          <Text style={styles.linkTxt}>Create account</Text>
        </Pressable>

        <Pressable
          style={styles.exploreBtn}
          onPress={() => enterGuestExploreAndOpenHome(enterGuestExplore)}
        >
          <Text style={styles.exploreBtnTxt}>Explore Get Vaulted</Text>
        </Pressable>

        <LegalConsentNote />
      </ScrollView>

      <Modal visible={forgotOpen} transparent animationType="fade" onRequestClose={() => setForgotOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setForgotOpen(false)}>
          <Pressable style={[styles.modalCard, { marginBottom: insets.bottom }]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Reset password</Text>
            <Text style={styles.modalBody}>{AUTH_USER_MESSAGES.passwordResetBody}</Text>
            <TextInput
              style={styles.input}
              placeholder="Your account email"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={forgotEmail}
              onChangeText={setForgotEmail}
            />
            <View style={styles.modalRow}>
              <Pressable style={styles.modalGhost} onPress={() => setForgotOpen(false)}>
                <Text style={styles.modalGhostTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalGold, forgotBusy && { opacity: 0.7 }]}
                disabled={forgotBusy}
                onPress={() => void onForgotSend()}
              >
                {forgotBusy ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.modalGoldTxt}>Send link</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  keepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  keepLabel: { color: colors.textSecondary, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  forgotWrap: { alignSelf: 'flex-end', paddingVertical: spacing.xs },
  forgotTxt: { color: colors.gold, fontSize: 14, fontWeight: '600' },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    borderRadius: radii.lg,
    padding: spacing.xl,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: spacing.md,
  },
  modalTitle: { ...typography.title, color: colors.textPrimary, fontSize: 18 },
  modalBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  modalRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  modalGhost: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalGhostTxt: { color: colors.textPrimary, fontWeight: '700' },
  modalGold: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  modalGoldTxt: { color: colors.background, fontWeight: '800' },
});
