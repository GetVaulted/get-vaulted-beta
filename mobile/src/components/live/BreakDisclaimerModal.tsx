import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { siteUrls } from '../../lib/siteUrls';
import { colors, radii, spacing } from '../../theme';

const STORAGE_PREFIX = 'gv:break-disclaimer:v1';

export function breakDisclaimerStorageKey(liveRoomId: string, userId: string | null | undefined): string {
  const u = userId && userId.length > 0 ? userId : 'anon';
  return `${STORAGE_PREFIX}:${u}:${liveRoomId}`;
}

export async function readBreakDisclaimerAccepted(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key)) === '1';
  } catch {
    return false;
  }
}

export async function writeBreakDisclaimerAccepted(key: string): Promise<void> {
  await AsyncStorage.setItem(key, '1');
}

type Props = {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

/**
 * Mandatory break-room notice. Card is height-capped with a scrollable body so
 * Leave / OK stay reachable on small phones and large accessibility text.
 */
export function BreakDisclaimerModal({ visible, onAccept, onDecline }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const padX = Math.max(spacing.md, Math.min(spacing.lg, width * 0.05));
  const padY = Math.max(spacing.sm, Math.min(spacing.md, height * 0.02));
  const maxCardHeight = Math.max(280, height - insets.top - insets.bottom - padY * 2);
  const stackActions = width < 390 || height < 700;
  // Keep header + actions on-screen; body scrolls inside the leftover height (Android needs an explicit bound).
  const headerReserve = 72;
  const actionsReserve = stackActions ? 128 : 80;
  const scrollMaxHeight = Math.max(120, maxCardHeight - headerReserve - actionsReserve);

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onDecline}>
      <View
        style={[
          styles.root,
          {
            paddingTop: insets.top + padY,
            paddingBottom: insets.bottom + padY,
            paddingHorizontal: padX,
          },
        ]}
      >
        <View style={[styles.card, { maxHeight: maxCardHeight }]}>
          <View style={styles.header}>
            <Text style={styles.eyebrow} maxFontSizeMultiplier={1.2}>
              Required
            </Text>
            <Text style={styles.title} maxFontSizeMultiplier={1.25}>
              Live Break Notice
            </Text>
          </View>

          <ScrollView
            style={[styles.scroll, { maxHeight: scrollMaxHeight }]}
            contentContainerStyle={styles.scrollContent}
            bounces={false}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <Text style={styles.body} maxFontSizeMultiplier={1.35}>
              By participating in this break, you acknowledge that results are random or event-based, that no specific
              outcome or value is guaranteed, and that you accept the risk of low-value or no-hit results. You agree to
              the break rules, livestream rules, and platform terms. The stream may be recorded or clipped.
            </Text>
            <Pressable
              onPress={() => void Linking.openURL(siteUrls.terms())}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel="View Terms of Service"
            >
              <Text style={styles.link} maxFontSizeMultiplier={1.3}>
                View Terms of Service
              </Text>
            </Pressable>
          </ScrollView>

          <View style={[styles.actions, stackActions && styles.actionsStacked]}>
            <Pressable
              style={[styles.secondaryBtn, stackActions && styles.btnFull]}
              onPress={onDecline}
              accessibilityRole="button"
              accessibilityLabel="Leave room"
            >
              <Text style={styles.secondaryTxt} maxFontSizeMultiplier={1.2}>
                Leave room
              </Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, stackActions && styles.btnFull]}
              onPress={onAccept}
              accessibilityRole="button"
              accessibilityLabel="OK, I agree"
            >
              <Text style={styles.primaryTxt} maxFontSizeMultiplier={1.2}>
                OK, I agree
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0a0a0d',
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  body: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  link: { color: colors.gold, fontWeight: '700', fontSize: 13 },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  actionsStacked: {
    flexDirection: 'column-reverse',
  },
  btnFull: {
    flex: 0,
    width: '100%',
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 48,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryTxt: { color: colors.textSecondary, fontWeight: '700', textAlign: 'center' },
  primaryBtn: {
    flex: 1,
    minHeight: 48,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryTxt: { color: '#111', fontWeight: '800', textAlign: 'center' },
});
