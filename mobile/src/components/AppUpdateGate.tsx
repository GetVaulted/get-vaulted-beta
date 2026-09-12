import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMinRequiredBuildNumber, getLocalBuildNumber } from '../lib/appUpdateGate';
import { storeListingUrl } from '../lib/storeReview';
import { BrandLogo } from './ui/BrandLogo';
import { colors, radii, spacing, typography } from '../theme';

/**
 * Silent, background version check dropped in once near the app root (see App.tsx). Renders
 * nothing while the app is up to date or the check is still in flight/unreachable — it only ever
 * pops a full-screen, non-dismissable "Update required" modal on top of whatever screen is
 * already showing once it's confirmed the running build is below the server's minimum.
 *
 * Deliberately does NOT gate the app's first paint on this network call — that would add latency
 * to every single cold start for the 99% of launches where no update is required (see the
 * cold-start/app-slowness work from 2026-09). It runs after mount instead and only interrupts if
 * it actually finds you're out of date.
 */
export function AppUpdateGate() {
  const insets = useSafeAreaInsets();
  const [blocked, setBlocked] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const minRequired = await fetchMinRequiredBuildNumber();
      if (cancelled || !minRequired) return; // null/0 → no minimum set, or check failed → fail open
      if (getLocalBuildNumber() < minRequired) setBlocked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Android hardware back button must not be able to dismiss this — there is nowhere to go back to.
  useEffect(() => {
    if (!blocked) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [blocked]);

  const onUpdate = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const url = storeListingUrl();
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
    } finally {
      setOpening(false);
    }
  };

  return (
    <Modal
      visible={blocked}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={[styles.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.center}>
          <BrandLogo width={180} />
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-download-outline" size={40} color={colors.gold} />
          </View>
          <Text style={styles.title}>Update required</Text>
          <Text style={styles.body}>
            A new version of Get Vaulted is available. Update the app to keep buying, selling, and
            watching live shows.
          </Text>
          <Pressable style={styles.cta} onPress={() => void onUpdate()} disabled={opening}>
            {opening ? <ActivityIndicator color={colors.background} /> : <Text style={styles.ctaTxt}>Update now</Text>}
          </Pressable>
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
    marginTop: spacing.xl,
  },
  title: { ...typography.title, color: colors.textPrimary, fontSize: 22, textAlign: 'center' },
  body: { color: colors.textSecondary, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  cta: {
    marginTop: spacing.md,
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  ctaTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
});
