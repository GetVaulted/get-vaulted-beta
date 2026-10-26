import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import {
  confirmPhoneVerificationCode,
  fetchPhoneVerificationStatus,
  sendPhoneVerificationCode,
} from '../../api/phoneVerificationRepository';
import { colors } from '../../theme/colors';

const RECHECK_MIN_INTERVAL_MS = 60_000;

/**
 * Full-screen "verify your phone" step. The server decides who needs it (new accounts after the
 * cutover, plus any older account an admin flags); this just asks and shows the screen. It fails
 * open: if the status check can't be completed, nobody is locked out. Each number can be linked
 * to one account only, which is what stops duplicate / throwaway accounts.
 */
export function PhoneVerificationGate() {
  const { user, session, loading, guestExploreMode, signOut } = useAuth();
  const token = session?.access_token ?? null;
  const userId = user?.id ?? null;

  const [needed, setNeeded] = useState(false);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastCheckRef = useRef(0);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const check = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    lastCheckRef.current = Date.now();
    try {
      const status = await fetchPhoneVerificationStatus(t);
      setNeeded(status.required && !status.verified && status.canSendCodes);
    } catch {
      /* fail open */
    }
  }, []);

  useEffect(() => {
    setNeeded(false);
    setStep('phone');
    setCode('');
    setError(null);
    if (loading || guestExploreMode || !userId || !token) return;
    void check();
  }, [check, guestExploreMode, loading, token, userId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      if (Date.now() - lastCheckRef.current < RECHECK_MIN_INTERVAL_MS) return;
      void check();
    });
    return () => sub.remove();
  }, [check]);

  const sendCode = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await sendPhoneVerificationCode(token, phone);
      if (r.alreadyVerified) {
        setNeeded(false);
        return;
      }
      setCode('');
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, phone, token]);

  const confirm = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      await confirmPhoneVerificationCode(token, phone, code);
      setNeeded(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check the code. Try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, code, phone, token]);

  if (!needed) return null;

  const canSend = phone.replace(/\D/g, '').length >= 10 && !busy;
  const canConfirm = code.replace(/\D/g, '').length >= 4 && !busy;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={() => {}}>
      <SafeAreaView style={styles.root}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Verify your phone</Text>
            <Text style={styles.body}>
              {step === 'phone'
                ? 'To bid, buy, enter giveaways and sell on Get Vaulted, confirm a mobile number. We text you a 6-digit code, and each number can be used on one account.'
                : 'Enter the 6-digit code we just texted to your phone.'}
            </Text>

            {step === 'phone' ? (
              <>
                <Text style={styles.label}>Mobile number</Text>
                <TextInput
                  id="phone-verification-number"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="(555) 123-4567"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  style={styles.input}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!canSend}
                  onPress={() => void sendCode()}
                  style={[styles.button, !canSend && styles.buttonDisabled]}
                >
                  {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Text me a code</Text>}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.label}>Code</Text>
                <TextInput
                  id="phone-verification-code"
                  value={code}
                  onChangeText={setCode}
                  placeholder="123456"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={10}
                  style={[styles.input, styles.codeInput]}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!canConfirm}
                  onPress={() => void confirm()}
                  style={[styles.button, !canConfirm && styles.buttonDisabled]}
                >
                  {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Verify</Text>}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    setError(null);
                    setStep('phone');
                  }}
                  style={styles.linkButton}
                >
                  <Text style={styles.link}>Use a different number or resend</Text>
                </Pressable>
              </>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.linkButton}>
              <Text style={styles.linkMuted}>Sign out</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32, gap: 14 },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: '800' },
  body: { color: colors.textSecondary, fontSize: 16, lineHeight: 23 },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.textPrimary,
    fontSize: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  codeInput: { letterSpacing: 6, textAlign: 'center', fontSize: 26 },
  button: { backgroundColor: colors.gold, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#000', fontSize: 17, fontWeight: '800' },
  linkButton: { alignItems: 'center', paddingVertical: 10 },
  link: { color: colors.gold, fontSize: 15, fontWeight: '700' },
  linkMuted: { color: colors.textMuted, fontSize: 14 },
  error: { color: colors.live, fontSize: 15, lineHeight: 21 },
});
