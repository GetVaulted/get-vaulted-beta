import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, View } from 'react-native';
import { LiveRoomText } from './LiveRoomText';
import { colors, radii, spacing } from '../../theme';

type Props = {
  title: string;
  message: string;
  variant?: 'outbid' | 'info';
};

export function LiveBidNoticeToast({ title, message, variant = 'outbid' }: Props) {
  const accent = variant === 'outbid' ? 'rgba(255, 92, 82, 0.42)' : 'rgba(255, 215, 80, 0.35)';
  const iconName = variant === 'outbid' ? 'trending-up' : 'information-circle';

  return (
    <View style={styles.wrap} pointerEvents="none">
      <BlurView intensity={Platform.OS === 'ios' ? 48 : 72} tint="dark" style={[styles.card, { borderColor: accent }]}>
        <View style={[styles.iconRing, { borderColor: accent }]}>
          <Ionicons name={iconName} size={16} color={variant === 'outbid' ? '#ff8a80' : colors.gold} />
        </View>
        <View style={styles.copy}>
          <LiveRoomText style={styles.title}>{title}</LiveRoomText>
          <LiveRoomText style={styles.message}>{message}</LiveRoomText>
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 104,
    alignSelf: 'center',
    zIndex: 92,
    maxWidth: '90%',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'rgba(12, 10, 8, 0.55)',
  },
  iconRing: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  copy: { flexShrink: 1, gap: 2 },
  title: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  message: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontWeight: '600' },
});
