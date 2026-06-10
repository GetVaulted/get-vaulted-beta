import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MARKETPLACE_TEXT_PROPS } from '../../lib/marketplaceUiScale';
import { colors, radii, spacing } from '../../theme';

type Variant = 'primary' | 'secondary' | 'ghost';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
  flex?: boolean;
  disabled?: boolean;
};

export function PremiumVaultButton({
  label,
  onPress,
  variant = 'secondary',
  icon,
  compact,
  flex,
  disabled,
}: Props) {
  const height = compact ? 44 : 48;
  const fontSize = compact ? 13 : 14;

  if (variant === 'ghost') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.ghost,
          { width: height, height, borderRadius: height / 2 },
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        {icon ? <Ionicons name={icon} size={compact ? 20 : 22} color={colors.textPrimary} /> : null}
      </Pressable>
    );
  }

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          flex && styles.flex,
          { minHeight: height },
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <LinearGradient
          colors={['#F0D56A', colors.gold, '#9A7B2C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.primary, { minHeight: height, borderRadius: radii.md }]}
        >
          {icon ? <Ionicons name={icon} size={18} color={colors.background} /> : null}
          <Text style={[styles.primaryTxt, { fontSize }]} numberOfLines={1} ellipsizeMode="tail" {...MARKETPLACE_TEXT_PROPS}>
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        flex && styles.flex,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.secondary, { minHeight: height, borderRadius: radii.md }]}>
        {icon ? <Ionicons name={icon} size={16} color={colors.gold} /> : null}
        <Text style={[styles.secondaryTxt, { fontSize }]} numberOfLines={1} ellipsizeMode="tail" {...MARKETPLACE_TEXT_PROPS}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.45 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  primaryTxt: {
    color: colors.background,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.38)',
  },
  secondaryTxt: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  ghost: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
});
