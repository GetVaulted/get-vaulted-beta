import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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

export function BreakDisclaimerModal({ visible, onAccept, onDecline }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onDecline}>
      <View style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Required</Text>
          <Text style={styles.title}>Live Break Notice</Text>
          <Text style={styles.body}>
            By participating in this break, you acknowledge that results are random or event-based, that no specific
            outcome or value is guaranteed, and that you accept the risk of low-value or no-hit results. You agree to
            the break rules, livestream rules, and platform terms. The stream may be recorded or clipped.
          </Text>
          <Pressable onPress={() => void Linking.openURL(siteUrls.terms())}>
            <Text style={styles.link}>View Terms of Service</Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={onDecline}>
              <Text style={styles.secondaryTxt}>Leave room</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={onAccept}>
              <Text style={styles.primaryTxt}>OK, I agree</Text>
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
    padding: spacing.lg,
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0a0a0d',
    padding: spacing.lg,
    gap: spacing.md,
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
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  secondaryBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
  },
  secondaryTxt: { color: colors.textSecondary, fontWeight: '700' },
  primaryBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  primaryTxt: { color: '#111', fontWeight: '800' },
});
