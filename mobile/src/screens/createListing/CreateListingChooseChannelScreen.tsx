import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateListingDraft } from '../../createListing/CreateListingDraftContext';
import { LISTING_CHANNEL_CONFIG, type ListingChannel } from '../../createListing/listingChannel';
import type { CreateListingStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<CreateListingStackParamList, 'CreateListingChooseChannel'>;

function ChannelCard({
  channel,
  onPress,
}: {
  channel: ListingChannel;
  onPress: () => void;
}) {
  const cfg = LISTING_CHANNEL_CONFIG[channel];
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, { borderColor: cfg.border }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={cfg.label}
    >
      <LinearGradient colors={cfg.gradient} style={StyleSheet.absoluteFillObject} />
      <View style={[styles.iconRing, { borderColor: cfg.border, backgroundColor: cfg.fill }]}>
        <Ionicons name={cfg.icon} size={28} color={cfg.primary} />
      </View>
      <Text style={styles.cardTitle}>{cfg.label}</Text>
      <Text style={styles.cardHelper}>{cfg.helper}</Text>
      <Text style={[styles.cardFuture, { color: cfg.primaryMuted }]}>{cfg.futureNote}</Text>
      <View style={[styles.cardCta, { backgroundColor: cfg.primary }]}>
        <Text style={styles.cardCtaText}>Continue</Text>
        <Ionicons name="arrow-forward" size={16} color="#0a0a0a" />
      </View>
    </Pressable>
  );
}

export function CreateListingChooseChannelScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { beginListingChannel } = useCreateListingDraft();
  const close = () => navigation.getParent()?.goBack();

  const pick = (channel: ListingChannel) => {
    beginListingChannel(channel);
    navigation.navigate('CreateListingMedia', { reset: true, channel });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.head}>
        <View style={styles.headBtnSpacer} />
        <Pressable
          onPress={close}
          style={styles.closeBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Exit listing"
        >
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>
      <Text style={styles.kicker}>Seller HQ · New listing</Text>
      <Text style={styles.title}>What are you creating?</Text>
      <Text style={styles.sub}>
        Choose where this item will live. Marketplace and live show inventory use separate flows so you always know
        where buyers will find it.
      </Text>
      <View style={styles.cards}>
        <ChannelCard channel="marketplace" onPress={() => pick('marketplace')} />
        <ChannelCard channel="live_show" onPress={() => pick('live_show')} />
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
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headBtnSpacer: {
    width: 40,
    height: 40,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  kicker: {
    ...typography.micro,
    color: colors.gold,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.title,
    fontSize: 28,
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: spacing.sm,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  cards: {
    gap: spacing.lg,
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
    overflow: 'hidden',
    gap: spacing.sm,
  },
  cardPressed: {
    opacity: 0.94,
  },
  iconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  cardHelper: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  cardFuture: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  cardCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.md,
    paddingVertical: 14,
    borderRadius: radii.md,
  },
  cardCtaText: {
    color: '#0a0a0a',
    fontWeight: '800',
    fontSize: 15,
  },
});
