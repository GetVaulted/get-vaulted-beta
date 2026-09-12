import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { getAssuranceLevels, getVerifiedTotpFactor, verifyTotpCode } from '../../lib/mfaService';
import { rootNavigationRef } from '../../navigation/rootNavigationRef';
import { colors, radii, spacing, typography } from '../../theme';

/**
 * Sits near the navigator root (see RootNavigator) and watches the auth session. A password (or
 * social) sign-in leaves Supabase at AAL1 even when the account has 2FA enrolled — the app has to
 * explicitly check for and enforce the AAL1→AAL2 step-up itself; Supabase doesn't block anything
 * on its own. This is that enforcement: a non-dismissable, full-screen code prompt covering
 * whatever screen would otherwise be showing, until the TOTP challenge passes.
 *
 * Re-checks on every session change, which naturally covers cold start too (a persisted session
 * that never finished its challenge — e.g. the app was killed mid-prompt — reliably re-prompts
 * instead of quietly granting access).
 */
export function MfaChallengeGate() {
  const insets = useSafeAreaInsets();
  const { session, loading, signOut } = useAuth();
  const [visible, setVisible] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkToken = useRef(0);

  useEffect(() => {
    if (loading) return;
    const token = ++checkToken.current;
    if (!session) {
      setVisible(false);
      return;
    }
    void (async () => {
      try {
        const { currentLevel, nextLevel } = await getAssuranceLevels();
        if (token !== checkToken.current) return; // a newer session change superseded this check
        if (currentLevel === 'aal1' && nextLevel === 'aal2') {
          const factor = await getVerifiedTotpFactor();
          if (token !== checkToken.current) return;
          if (factor) {
            setFactorId(factor.id);
            setCode('');
            setError(null);
            setVisible(true);
            return;
          }
        }
        setVisible(false);
      } catch {
        // Fail open — never lock someone out of the app because the AAL check itself errored.
        setVisible(false);
      }
    })();
  }, [session, loading]);

  const onVerify = async () => {
    if (busy || !factorId) return;
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyTotpCode(factorId, code);
      setVisible(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code — try again.');
    } finally {
      setBusy(false);
    }
  };

  const onSignOut = () => {
    setVisible(false);
    void signOut();
  };

  const onContactSupport = () => {
    setVisible(false);
    if (rootNavigationRef.isReady()) {
      rootNavigationRef.navigate('ContactSupport', { category: 'account' });
    }
  };

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => {}}>
      <View style={[styles.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <Text style={styles.iconTxt}>🔒</Text>
          </View>
          <Text style={styles.title}>Two-factor verification</Text>
          <Text style={styles.body}>Enter the 6-digit code from your authenticator app to continue.</Text>

          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(t) => {
              setCode(t.replace(/[^0-9]/g, '').slice(0, 6));
              setError(null);
            }}
            placeholder="123456"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          {error ? <Text style={styles.err}>{error}</Text> : null}

          <Pressable style={[styles.cta, busy && { opacity: 0.7 }]} onPress={() => void onVerify()} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.ctaTxt}>Verify</Text>}
          </Pressable>

          <View style={styles.footerRow}>
            <Pressable onPress={onContactSupport}>
              <Text style={styles.footerLink}>Lost access?</Text>
            </Pressable>
            <Text style={styles.footerDot}>·</Text>
            <Pressable onPress={onSignOut}>
              <Text style={styles.footerLink}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  center: { width: '100%', maxWidth: 400, alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  iconTxt: { fontSize: 26 },
  title: { ...typography.title, color: colors.textPrimary, fontSize: 22, textAlign: 'center' },
  body: { color: colors.textSecondary, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  input: {
    width: '100%',
    marginTop: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: spacing.md,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.05)',
    fontSize: 22,
    letterSpacing: 6,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  err: { color: '#f0a8a8', fontSize: 13, textAlign: 'center' },
  cta: {
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  ctaTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  footerLink: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  footerDot: { color: colors.textMuted, fontSize: 13 },
});
