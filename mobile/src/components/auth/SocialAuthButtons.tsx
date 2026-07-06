import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
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
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </Svg>
  );
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
