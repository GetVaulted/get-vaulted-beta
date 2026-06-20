import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

type Props = {
  placeholder?: string;
  onPress?: () => void;
  compact?: boolean;
  /** Polished home-screen search styling. */
  home?: boolean;
};

export function SearchBar({
  placeholder = 'Search live, sellers, grails…',
  onPress,
  compact,
  home,
}: Props) {
  const inner = (
    <>
      <Ionicons name="search" size={home ? 17 : 18} color="rgba(255,255,255,0.38)" />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.35)"
        style={[styles.input, compact && styles.inputCompact, home && styles.inputHome]}
        allowFontScaling={false}
        editable={!onPress}
        pointerEvents={onPress ? 'none' : 'auto'}
      />
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.wrap, compact && styles.wrapCompact, home && styles.wrapHome]}
        accessibilityRole="button"
      >
        {inner}
      </Pressable>
    );
  }

  return <View style={[styles.wrap, compact && styles.wrapCompact, home && styles.wrapHome]}>{inner}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '100%',
  },
  wrapCompact: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  wrapHome: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: spacing.sm,
  },
  input: {
    flex: 1,
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: 4,
  },
  inputCompact: {
    fontSize: 14,
    paddingVertical: 2,
  },
  inputHome: {
    fontSize: 14,
    paddingVertical: 0,
    fontWeight: '500',
  },
});
