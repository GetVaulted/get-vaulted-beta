import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { colors, radii, spacing } from '../../theme';

export type AuthPasswordFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  visible: boolean;
  onToggleVisible: () => void;
  autoComplete?: 'password' | 'new-password';
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

/** Password input with in-field show/hide toggle — matches auth screen styling. */
export function AuthPasswordField({
  value,
  onChangeText,
  placeholder,
  visible,
  onToggleVisible,
  autoComplete = 'password',
  containerStyle,
  inputStyle,
}: AuthPasswordFieldProps) {
  return (
    <View style={[styles.row, containerStyle]}>
      <TextInput
        style={[styles.input, inputStyle]}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete={autoComplete}
        textContentType={autoComplete === 'new-password' ? 'newPassword' : 'password'}
        value={value}
        onChangeText={onChangeText}
      />
      <Pressable
        style={styles.eyeBtn}
        onPress={onToggleVisible}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        hitSlop={8}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    color: colors.textPrimary,
    fontSize: 16,
  },
  eyeBtn: {
    padding: spacing.md,
  },
});
