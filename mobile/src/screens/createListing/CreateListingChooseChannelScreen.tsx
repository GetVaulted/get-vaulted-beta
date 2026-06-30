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
      <View style={styles.cardTop}>
        <View style={[styles.iconRing, { borderColor: cfg.border, backgroundColor: cfg.fill }]}>
          <Ionicons name={cfg.icon} size={26} color={cfg.primary} />
        </View>
        <Ionicons name="arrow-forward-circle" size={28} color={cfg.primaryMuted} />
      </View>
      <Text style={styles.cardTitle}>{cfg.label}</Text>
      <Text style={styles.cardHelper}>{cfg.helper}</Text>
      <View style={[styles.featurePill, { borderColor: cfg.border, backgroundColor: 'rgba(0,0,0,0.25)' }]}>
        <Text style={[styles.featurePillText, { color: cfg.primary }]}>{cfg.futureNote}</Text>
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
    <View style={styles.screen}>
      <LinearGradient
        colors={['rgba(212,175,55,0.12)', 'rgba(5,5,5,0.95)', colors.background]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <View style={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.head}>
          <View style={styles.headBtnSpacer} />
          <Pressable
            onPress={close}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Exit listing"
          >
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        <Text style={styles.kicker}>Seller HQ · New listing</Text>
        <Text style={styles.title}>Where should this item live?</Text>
        <Text style={styles.sub}>
          Marketplace and live show inventory are separate. Pick the path that matches how you plan to sell.
        </Text>

        <View style={styles.cards}>
          <ChannelCard channel="marketplace" onPress={() => pick('marketplace')} />
          <ChannelCard channel="live_show" onPress={() => pick('live_show')} />
        </View>

        <View style={styles.footerHint}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
          <Text style={styles.footerHintText}>You can save drafts anytime and finish later from Seller HQ.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
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
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  closeBtnPressed: { opacity: 0.75 },
  kicker: {
    ...typography.micro,
    color: colors.gold,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.title,
    fontSize: 30,
    color: colors.textPrimary,
    letterSpacing: -0.6,
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
    flex: 1,
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
    overflow: 'hidden',
    gap: spacing.sm,
    minHeight: 168,
  },
  cardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  iconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  cardHelper: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  featurePill: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  featurePillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  footerHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  footerHintText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
});
