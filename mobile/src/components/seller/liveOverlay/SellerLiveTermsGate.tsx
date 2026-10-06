import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { acceptSellerLiveTerms, fetchSellerLiveTermsRequired } from '../../../api/sellerAccountRepository';
import { siteUrls } from '../../../lib/siteUrls';
import { colors, radii, spacing } from '../../../theme';

type Props = {
  accessToken: string;
  /** Leave the console when the seller declines for now. */
  onDecline: () => void;
};

/**
 * Blocks the seller console until the seller accepts the updated live-content terms (Terms §7.1).
 * The go-live API routes enforce the same rule; this explains it up front. Fails open on a status
 * error — the server still blocks going live.
 */
export function SellerLiveTermsGate({ accessToken, onDecline }: Props) {
  const [required, setRequired] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const needed = await fetchSellerLiveTermsRequired(accessToken);
        if (!cancelled && needed) setRequired(true);
      } catch {
        /* server-side gate still applies */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const accept = useCallback(async () => {
    if (!agreed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await acceptSellerLiveTerms(accessToken);
      setRequired(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not save your acceptance. Try again.');
    } finally {
      setSaving(false);
    }
  }, [accessToken, agreed, saving]);

  return (
    <Modal
      visible={required}
      animationType="fade"
      transparent
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onDecline}
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="document-text-outline" size={22} color={colors.gold} />
          </View>
          <Text style={styles.title}>Updated seller terms</Text>
          <Text style={styles.body}>
            Before you go live, please review and accept our updated terms. You are responsible for everything shown or
            heard in your live shows, including your camera, background, music, guests, and the claims you make about
            items.
          </Text>
          <Pressable
            onPress={() => void Linking.openURL(`${siteUrls.terms()}#live-content`)}
            accessibilityRole="link"
            accessibilityLabel="Read Terms Section 7.1"
            hitSlop={8}
          >
            <Text style={styles.link}>Read Terms Section 7.1</Text>
          </Pressable>
          <Pressable
            style={styles.agreeRow}
            onPress={() => setAgreed((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            accessibilityLabel="I agree to the updated seller terms"
          >
            <Ionicons
              name={agreed ? 'checkbox' : 'square-outline'}
              size={22}
              color={agreed ? colors.gold : 'rgba(255,255,255,0.5)'}
            />
            <Text style={styles.agreeText}>
              I have read and agree to the updated seller terms, including responsibility for my live content.
            </Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              style={[styles.primaryBtn, (!agreed || saving) && styles.primaryBtnDisabled]}
              onPress={() => void accept()}
              disabled={!agreed || saving}
              accessibilityRole="button"
              accessibilityLabel="Agree and continue"
            >
              {saving ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text pointerEvents="none" style={styles.primaryLabel}>
                  Agree and continue
                </Text>
              )}
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={onDecline}
              accessibilityRole="button"
              accessibilityLabel="Not now"
            >
              <Text pointerEvents="none" style={styles.secondaryLabel}>
                Not now
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 80, 0.22)',
    backgroundColor: 'rgba(10, 10, 11, 0.97)',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md + 4,
    alignItems: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 80, 0.28)',
    backgroundColor: 'rgba(255, 215, 80, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  body: {
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  link: { marginTop: spacing.sm, fontSize: 13, fontWeight: '700', color: colors.gold },
  agreeRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    width: '100%',
  },
  agreeText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.textPrimary },
  error: { marginTop: spacing.sm, fontSize: 12, color: '#fda4af', textAlign: 'center' },
  actions: { marginTop: spacing.lg, width: '100%', gap: spacing.sm },
  primaryBtn: {
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.background,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  secondaryBtn: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
});
