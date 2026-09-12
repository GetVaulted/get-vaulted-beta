import { forwardRef, useImperativeHandle, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { confirmEnjoyingApp, recordReviewPromptShown, shouldShowReviewPrompt } from '../../lib/storeReview';
import type { ReviewPromptGateHandle } from '../../lib/reviewPromptGateRef';
import { rootNavigationRef } from '../../navigation/rootNavigationRef';
import { colors, radii, spacing, typography } from '../../theme';

/**
 * The "Enjoying Get Vaulted?" satisfaction gate — mounted once near the navigator root (see
 * RootNavigator) and triggered imperatively via `maybeShowReviewPrompt(reason)` from win moments
 * (checkout paid, review submitted). "Not really" routes to Contact Support instead of the store,
 * so unhappy users never land on the App Store / Play Store review flow. "Yes!" hands off to
 * confirmEnjoyingApp(), which is intentionally platform-specific — see storeReview.ts for why.
 */
export const ReviewPromptGate = forwardRef<ReviewPromptGateHandle>(function ReviewPromptGate(_props, ref) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useImperativeHandle(ref, () => ({
    show: (_reason) => {
      void (async () => {
        if (visible) return;
        const eligible = await shouldShowReviewPrompt();
        if (!eligible) return;
        await recordReviewPromptShown();
        setVisible(true);
      })();
    },
  }));

  const onNotReally = () => {
    setVisible(false);
    if (rootNavigationRef.isReady()) {
      rootNavigationRef.navigate('ContactSupport', { category: 'other' });
    }
  };

  const onYes = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await confirmEnjoyingApp();
    } finally {
      setBusy(false);
      setVisible(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Enjoying Get Vaulted?</Text>
          <Text style={styles.body}>We'd love to hear how it's going so far.</Text>
          <View style={styles.row}>
            <Pressable style={styles.ghost} onPress={onNotReally} disabled={busy}>
              <Text style={styles.ghostTxt}>Not really</Text>
            </Pressable>
            <Pressable style={styles.gold} onPress={() => void onYes()} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.goldTxt}>Yes!</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    borderRadius: radii.lg,
    padding: spacing.xl,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: spacing.md,
  },
  title: { ...typography.title, color: colors.textPrimary, fontSize: 19, textAlign: 'center' },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  ghost: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  ghostTxt: { color: colors.textPrimary, fontWeight: '700' },
  gold: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldTxt: { color: colors.background, fontWeight: '800' },
});
