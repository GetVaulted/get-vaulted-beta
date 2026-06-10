import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

type Props = {
  placeholder?: string;
  onPress?: () => void;
  compact?: boolean;
};

export function SearchBar({ placeholder = 'Search live, sellers, grails…', onPress, compact }: Props) {
  const inner = (
    <>
      <Ionicons name="search" size={18} color={colors.textMuted} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, compact && styles.inputCompact]}
        allowFontScaling={false}
        editable={!onPress}
        pointerEvents={onPress ? 'none' : 'auto'}
      />
    </>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[styles.wrap, compact && styles.wrapCompact]} accessibilityRole="button">
        {inner}
      </Pressable>
    );
  }

  return <View style={[styles.wrap, compact && styles.wrapCompact]}>{inner}</View>;
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
});
