import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, radii, spacing } from '../../theme';

export type AuthPasswordFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  visible: boolean;
  onToggleVisible: () => void;
  /**
   * `new-password` — create-account primary field (may show iOS Strong Password).
   * `password` — sign-in.
   * `off` — confirm-password / fields that must not join the Strong Password pair
   * (iOS clears the first field when both are `newPassword` and the sheet is dismissed).
   */
  autoComplete?: 'password' | 'new-password' | 'off';
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
  const textContentType =
    autoComplete === 'new-password'
      ? 'newPassword'
      : autoComplete === 'off'
        ? 'none'
        : 'password';

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
        autoComplete={autoComplete === 'off' ? 'off' : autoComplete}
        textContentType={textContentType}
        // Android: keep confirm / opted-out fields out of autofill grouping.
        importantForAutofill={autoComplete === 'off' ? 'no' : 'yes'}
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
