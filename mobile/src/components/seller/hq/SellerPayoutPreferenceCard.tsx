import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  fetchSellerPayoutPreference,
  updateSellerPayoutPreference,
  type SellerPayoutPreferenceDTO,
} from '../../../api/sellerPayoutPreferenceRepository';
import { colors, radii, spacing } from '../../../theme';
import { hq } from './hqStyles';
import { StudioSection } from './SellerStudioUI';

/**
 * Choose Stripe Connect vs PayPal payout rail (mirrors web Seller HQ).
 */
export function SellerPayoutPreferenceCard({ accessToken }: { accessToken: string | undefined }) {
  const [data, setData] = useState<SellerPayoutPreferenceDTO | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const pref = await fetchSellerPayoutPreference(accessToken);
      if (!pref) {
        setError('Could not load payout preference.');
        return;
      }
      setData(pref);
      setEmail(pref.paypalPayoutEmail ?? '');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (body: {
    preferredSellerPayoutProcessor?: 'STRIPE' | 'PAYPAL';
    paypalPayoutEmail?: string | null;
    verifyPayPalEmail?: boolean;
  }) => {
    if (!accessToken || busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await updateSellerPayoutPreference(accessToken, body);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setData(res.data);
      setEmail(res.data.paypalPayoutEmail ?? '');
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) return null;

  if (loading && !data) {
    return (
      <View style={[styles.loadingShell, hq.goldCard]}>
        <ActivityIndicator color={colors.gold} />
        <Text style={styles.loadingTxt}>Loading payout method…</Text>
      </View>
    );
  }

  if (!data) {
    return error ? (
      <View style={styles.errorCard}>
        <Text style={styles.errorTxt}>{error}</Text>
        <Pressable onPress={() => void load()} hitSlop={8}>
          <Text style={styles.retryTxt}>Retry</Text>
        </Pressable>
      </View>
    ) : null;
  }

  const stripeSelected = data.preferredSellerPayoutProcessor === 'STRIPE';
  const paypalSelected = data.preferredSellerPayoutProcessor === 'PAYPAL';

  return (
    <StudioSection
      title="Payout method"
      subtitle="Buyers still pay with card/wallet. Choose how you receive seller earnings."
    >
      <View style={[styles.card, hq.goldCard]}>
        <View style={styles.choiceRow}>
          <Pressable
            disabled={busy}
            onPress={() => void patch({ preferredSellerPayoutProcessor: 'STRIPE' })}
            style={[styles.choice, stripeSelected && styles.choiceSelected]}
          >
            <Ionicons
              name="card-outline"
              size={16}
              color={stripeSelected ? colors.gold : colors.textMuted}
            />
            <Text style={[styles.choiceTitle, stripeSelected && styles.choiceTitleSelected]}>
              Stripe Connect
            </Text>
            <Text style={styles.choiceHint}>
              {data.stripeOnboardingComplete ? 'Connected' : 'Complete Stripe onboarding'}
            </Text>
          </Pressable>

          <Pressable
            disabled={busy || !data.paypalSellerPayoutsEnabled}
            onPress={() => void patch({ preferredSellerPayoutProcessor: 'PAYPAL' })}
            style={[
              styles.choice,
              paypalSelected && styles.choiceSelected,
              !data.paypalSellerPayoutsEnabled && styles.choiceDisabled,
            ]}
          >
            <Ionicons
              name="logo-paypal"
              size={16}
              color={paypalSelected ? colors.gold : colors.textMuted}
            />
            <Text style={[styles.choiceTitle, paypalSelected && styles.choiceTitleSelected]}>
              PayPal
            </Text>
            <Text style={styles.choiceHint}>
              {data.paypalSellerPayoutsEnabled
                ? data.paypalPayoutVerifiedAt
                  ? 'Verified email ready'
                  : 'Add & verify PayPal email'
                : 'Not enabled yet'}
            </Text>
          </Pressable>
        </View>

        {data.paypalSellerPayoutsEnabled && paypalSelected ? (
          <View style={styles.emailBlock}>
            <Text style={styles.emailLbl}>PayPal payout email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@paypal.com"
              placeholderTextColor={colors.textMuted}
              style={styles.emailInput}
              autoFocus
            />
            <Text style={styles.emailHint}>
              No PayPal login — enter the email on your PayPal account, then Verify.
            </Text>
            <View style={styles.emailActions}>
              <Pressable
                disabled={busy}
                onPress={() => void patch({ paypalPayoutEmail: email })}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnTxt}>Save email</Text>
              </Pressable>
              <Pressable
                disabled={busy || !email.trim()}
                onPress={() => void patch({ paypalPayoutEmail: email, verifyPayPalEmail: true })}
                style={styles.verifyBtn}
              >
                <Text style={styles.verifyBtnTxt}>Verify</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.errorTxt}>{error}</Text> : null}
        {saved ? <Text style={styles.savedTxt}>Saved.</Text> : null}
      </View>
    </StudioSection>
  );
}

const styles = StyleSheet.create({
  loadingShell: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  loadingTxt: { color: colors.textMuted, fontSize: 12 },
  errorCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.25)',
    backgroundColor: 'rgba(127,29,29,0.2)',
    gap: spacing.sm,
  },
  card: {
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choice: {
    flex: 1,
    gap: 4,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  choiceSelected: {
    borderColor: 'rgba(212,175,55,0.55)',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  choiceDisabled: { opacity: 0.4 },
  choiceTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  choiceTitleSelected: { color: colors.gold },
  choiceHint: { color: colors.textMuted, fontSize: 10, lineHeight: 14 },
  emailBlock: { gap: spacing.xs },
  emailLbl: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  emailInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.4)',
    fontSize: 14,
  },
  emailHint: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  emailActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  secondaryBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  secondaryBtnTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  verifyBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.35)',
    backgroundColor: 'rgba(6,78,59,0.35)',
  },
  verifyBtnTxt: { color: '#A7F3D0', fontSize: 12, fontWeight: '700' },
  errorTxt: { color: '#FCA5A5', fontSize: 12 },
  savedTxt: { color: '#A7F3D0', fontSize: 12 },
  retryTxt: { color: colors.gold, fontSize: 12, fontWeight: '700' },
});
