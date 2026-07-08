import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchProfileIdByUsername } from '../../api/profilesRepository';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerProfileByUsername'>;

/**
 * Server notifications (e.g. "new follower") and shared web links point at `/seller/{username}`,
 * but the in-app profile screen (`UserProfile`) is keyed by user id. This screen resolves the
 * username to an id and replaces itself with `SellerShop`, so both `openNotificationHref` and
 * the universal-link config (`linkingConfig.ts`) can share the same destination without each
 * needing to perform the async lookup themselves.
 */
export function SellerProfileByUsernameScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { username } = route.params;
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchProfileIdByUsername(username).then((userId) => {
      if (cancelled) return;
      if (userId) {
        navigation.replace('SellerShop', { sellerId: userId });
      } else {
        setNotFound(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigation, username]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Seller shop" onBack={() => navigation.goBack()} />
      {notFound ? (
        <Text style={styles.muted}>This seller could not be found.</Text>
      ) : (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  muted: { color: colors.textMuted, marginTop: spacing.xl, lineHeight: 20 },
});
