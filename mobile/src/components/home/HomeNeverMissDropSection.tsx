import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

export function HomeNeverMissDropSection({
  onExploreLive,
}: {
  onExploreLive: () => void;
}) {
  return (
    <View style={styles.shell}>
      <LinearGradient
        colors={['rgba(212,175,55,0.1)', 'rgba(8,8,10,0.98)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.iconWrap}>
        <Ionicons name="notifications-outline" size={20} color={colors.gold} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Never Miss a Drop</Text>
        <Text style={styles.body}>
          Follow live rooms and set reminders when hosts schedule breaks, auctions, and vault events.
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
        onPress={onExploreLive}
        accessibilityRole="button"
        accessibilityLabel="Browse upcoming live shows"
      >
        <Text style={styles.btnTxt}>Browse Live Calendar</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.gold} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.22)',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.25)',
  },
  copy: { gap: 4 },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  body: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    lineHeight: 17,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: spacing.xs,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  btnTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gold,
  },
  pressed: { opacity: 0.9 },
});
