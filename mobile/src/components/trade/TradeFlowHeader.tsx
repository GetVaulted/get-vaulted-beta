import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography } from '../../theme';
import type { TradeCenterStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<TradeCenterStackParamList>;
  title: string;
  subtitle?: string;
};

export function TradeFlowHeader({ navigation, title, subtitle }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={12}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </Pressable>
      <View style={styles.titles}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  back: {
    marginTop: 2,
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  pressed: { opacity: 0.75 },
  titles: { flex: 1, minWidth: 0 },
  title: {
    ...typography.title,
    fontSize: 22,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  sub: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
