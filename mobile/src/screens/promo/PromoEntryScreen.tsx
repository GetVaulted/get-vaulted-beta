import { useCallback, useEffect, useState } from 'react';
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
import { useAuth } from '../../auth/AuthContext';
import {
  fetchPromoGiveaway,
  submitPromoAmoeEntry,
  type PromoGiveawayPayload,
} from '../../api/liveGiveawayRepository';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PromoEntry'>;

export function PromoEntryScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const slug = route.params.slug.trim();
  const [promo, setPromo] = useState<PromoGiveawayPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mailingAddress, setMailingAddress] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!slug) {
      setLoadError('Promotion not found.');
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchPromoGiveaway(slug);
        setPromo(data);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Could not load promotion.');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const handleSubmit = useCallback(async () => {
    if (!accessToken?.trim()) {
      navigation.navigate('AuthLogin');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitPromoAmoeEntry(accessToken, slug, { fullName, email, mailingAddress });
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not submit entry.');
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, email, fullName, mailingAddress, navigation, slug]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + spacing.md }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>Back</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={styles.kicker}>Official promotion rules</Text>
        {loading ? <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} /> : null}
        {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
        {promo ? (
          <View style={styles.body}>
            <Text style={styles.title}>{promo.title}</Text>
            <Text style={styles.host}>
              Hosted by @{promo.sellerUsername} · {promo.roomTitle}
            </Text>
            {promo.prizeDescription ? <Text style={styles.prize}>{promo.prizeDescription}</Text> : null}
            <View style={styles.rulesBox}>
              <Text style={styles.rules}>{promo.rulesText}</Text>
            </View>
            {!session ? (
              <Pressable style={styles.primaryBtn} onPress={() => navigation.navigate('AuthLogin')}>
                <Text style={styles.primaryBtnTxt}>Sign in to submit no-purchase entry</Text>
              </Pressable>
            ) : submitted ? (
              <Text style={styles.success}>Entry received. Good luck.</Text>
            ) : promo.entriesOpen ? (
              <View style={styles.form}>
                <Text style={styles.formKicker}>No-purchase entry (AMOE)</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Full legal name"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  value={mailingAddress}
                  onChangeText={setMailingAddress}
                  placeholder="Mailing address"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.textArea]}
                  multiline
                />
                {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
                <Pressable
                  style={styles.primaryBtn}
                  disabled={submitting}
                  onPress={() => void handleSubmit()}
                >
                  {submitting ? (
                    <ActivityIndicator color="#111" />
                  ) : (
                    <Text style={styles.primaryBtnTxt}>Submit no-purchase entry</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <Text style={styles.muted}>This promotion is not accepting entries right now.</Text>
            )}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topBar: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  back: { fontSize: 15, fontWeight: '700', color: colors.gold },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  body: { marginTop: spacing.md, gap: spacing.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  host: { fontSize: 13, color: colors.textSecondary },
  prize: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  rulesBox: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  rules: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  form: { gap: spacing.sm, marginTop: spacing.sm },
  formKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: 14,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  primaryBtn: {
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  primaryBtnTxt: { fontSize: 14, fontWeight: '800', color: '#111' },
  success: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
    backgroundColor: 'rgba(16,185,129,0.12)',
    padding: spacing.md,
    color: '#6ee7b7',
    fontSize: 14,
    fontWeight: '600',
  },
  muted: { fontSize: 14, color: colors.textMuted },
  error: { fontSize: 13, color: '#fca5a5', marginTop: spacing.sm },
});
