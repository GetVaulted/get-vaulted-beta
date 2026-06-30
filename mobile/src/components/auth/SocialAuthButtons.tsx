import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { isGoogleOAuthConfigured, mapAppleSignInErrorMessage } from '../../lib/authProviderAvailability';
import { AUTH_USER_MESSAGES } from '../../lib/authUserMessages';
import { isAppleSignInAvailable } from '../../lib/socialAuth';
import { colors, radii, spacing } from '../../theme';

type Props = {
  onGoogle: () => void;
  onApple: () => void;
  busy?: 'google' | 'apple' | null;
  disabled?: boolean;
  error?: string | null;
};

function GoogleMark() {
  return <Text style={styles.googleG}>G</Text>;
}

export function SocialAuthButtons({ onGoogle, onApple, busy, disabled, error }: Props) {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const googleConfigured = isGoogleOAuthConfigured();

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  const showSocial = googleConfigured || (Platform.OS === 'ios' && appleAvailable);
  if (!showSocial) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerTxt}>or continue with</Text>
        <View style={styles.dividerLine} />
      </View>

      {googleConfigured ? (
        <Pressable
          style={[styles.btn, (disabled || busy) && styles.btnDisabled]}
          onPress={() => {
            if (!busy && !disabled) onGoogle();
          }}
          disabled={disabled || Boolean(busy)}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
        >
          {busy === 'google' ? (
            <ActivityIndicator color={colors.textPrimary} size="small" />
          ) : (
            <GoogleMark />
          )}
          <Text style={styles.btnTxt}>{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</Text>
        </Pressable>
      ) : null}

      {Platform.OS === 'ios' && appleAvailable ? (
        <Pressable
          style={[styles.btn, styles.appleBtn, (disabled || busy) && styles.btnDisabled]}
          onPress={() => {
            if (!busy && !disabled) onApple();
          }}
          disabled={disabled || Boolean(busy)}
          accessibilityRole="button"
          accessibilityLabel="Continue with Apple"
        >
          {busy === 'apple' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="logo-apple" size={20} color="#fff" />
          )}
          <Text style={[styles.btnTxt, styles.appleTxt]}>
            {busy === 'apple' ? 'Opening Apple…' : 'Continue with Apple'}
          </Text>
        </Pressable>
      ) : null}

      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

export function socialAuthErrorMessage(e: unknown, cancelledMsg = AUTH_USER_MESSAGES.socialSignInCancelled): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const msg = String((e as { message?: string }).message ?? '');
    if (/cancel/i.test(msg)) return cancelledMsg;
    if (msg.trim()) return mapAppleSignInErrorMessage(msg);
  }
  return AUTH_USER_MESSAGES.socialSignInFailed;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.sm },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: spacing.md,
  },
  appleBtn: {
    backgroundColor: '#000',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  btnDisabled: { opacity: 0.55 },
  btnTxt: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  appleTxt: { color: '#fff' },
  googleG: {
    width: 20,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 16,
    color: '#4285F4',
  },
  err: { color: '#e08080', fontSize: 12, textAlign: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.12)' },
  dividerTxt: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
