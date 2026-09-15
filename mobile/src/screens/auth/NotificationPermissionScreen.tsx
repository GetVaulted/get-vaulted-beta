import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GetVaultedBrandMark } from '../../components/branding/GetVaultedBrandMark';
import { useAuth } from '../../auth/AuthContext';
import type { RootStackParamList } from '../../navigation/types';
import {
  alertPushRegistrationResult,
  isPushNotificationsAvailable,
  requestEnablePushNotifications,
} from '../../push/pushRegistrationService';
import { colors, radii, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationPermission'>;

const BENEFITS = [
  'Orders, offers, and payment updates',
  'Live chat tags and show alerts',
  'Seller sales and shipping updates',
] as const;

export function NotificationPermissionScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const source = route.params?.source ?? 'login';
  const isSignup = source === 'signup';

  const finishHome = () => {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Home' } }] });
  };

  const onEnable = async () => {
    if (busy) return;
    if (!isPushNotificationsAvailable()) {
      alertPushRegistrationResult({ ok: false, reason: 'Push requires a physical device.' });
      finishHome();
      return;
    }
    if (!user?.id) {
      finishHome();
      return;
    }
    setBusy(true);
    try {
      const res = await requestEnablePushNotifications({
        supabaseUserId: user.id,
        accessToken: session?.access_token,
      });
      if (res.ok) {
        finishHome();
        return;
      }
      if (res.reason.toLowerCase().includes('denied')) {
        alertPushRegistrationResult(res);
        return;
      }
      alertPushRegistrationResult(res);
    } finally {
      setBusy(false);
    }
  };

  const onOpenSettings = () => {
    void Linking.openSettings();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.brandBlock}>
        <GetVaultedBrandMark size="compact" />
      </View>

      <LinearGradient
        colors={['rgba(212,175,55,0.16)', 'rgba(10,10,12,0.96)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="notifications" size={36} color={colors.gold} />
        </View>
        <Text style={styles.heroEyebrow}>{isSignup ? 'ONE MORE STEP' : 'STAY IN THE LOOP'}</Text>
        <Text style={styles.title}>
          {isSignup ? 'Turn on notifications' : 'Enable notifications'}
        </Text>
        <Text style={styles.sub}>
          {isSignup
            ? 'Get Vaulted needs notifications so you never miss a bid win, order update, or live show alert.'
            : 'Notifications are still off on this device. Turn them on so you don’t miss orders, offers, and live alerts.'}
        </Text>
        {BENEFITS.map((line) => (
          <View key={line} style={styles.valueRow}>
            <Ionicons name="checkmark-circle" size={16} color={colors.gold} />
            <Text style={styles.valueTxt}>{line}</Text>
          </View>
        ))}
      </LinearGradient>

      <View style={styles.actions}>
        <Pressable
          style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
          onPress={() => void onEnable()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Enable notifications"
        >
          {busy ? (
            <ActivityIndicator color="#0a0a0c" />
          ) : (
            <Text style={styles.primaryTxt}>Enable notifications</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.secondaryBtn}
          onPress={onOpenSettings}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Open device settings"
        >
          <Text style={styles.secondaryTxt}>Open device settings</Text>
        </Pressable>

        <Pressable
          style={styles.laterBtn}
          onPress={finishHome}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Continue without notifications"
        >
          <Text style={styles.laterTxt}>
            {isSignup ? 'Continue without for now' : 'Not now'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  heroCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.22)',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  iconWrap: {
    alignSelf: 'flex-start',
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,55,0.12)',
    marginBottom: spacing.xs,
  },
  heroEyebrow: {
    ...typography.caption,
    color: colors.gold,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 28,
    lineHeight: 34,
  },
  sub: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  valueTxt: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  actions: {
    marginTop: 'auto',
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryTxt: {
    ...typography.body,
    color: '#0a0a0c',
    fontWeight: '800',
  },
  secondaryBtn: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  secondaryTxt: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  laterBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterTxt: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
