import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformFlowHeader } from '../platform/PlatformFlowHeader';
import { colors, radii, spacing } from '../../theme';

export function AdminScreenShell({
  title,
  subtitle,
  onBack,
  children,
  refreshing,
  onRefresh,
  loading,
  error,
  onRetry,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title={title} subtitle={subtitle} onBack={onBack} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          {onRetry ? (
            <Pressable onPress={onRetry} style={styles.retry}>
              <Text style={styles.retryTxt}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.gold} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      )}
    </View>
  );
}

export function AdminFilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AdminSearchField({
  value,
  onChange,
  placeholder,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
}) {
  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search-outline" size={16} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? 'Search'}
        placeholderTextColor={colors.textMuted}
        style={styles.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
      />
    </View>
  );
}

export function AdminListRow({
  title,
  meta,
  badge,
  badgeWarn,
  onPress,
}: {
  title: string;
  meta?: string;
  badge?: string;
  badgeWarn?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        {meta ? (
          <Text style={styles.rowMeta} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={[styles.badge, badgeWarn && styles.badgeWarn]}>
          <Text style={[styles.badgeTxt, badgeWarn && styles.badgeTxtWarn]}>{badge}</Text>
        </View>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

export function AdminActionButton({
  label,
  onPress,
  tone = 'default',
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger' | 'success';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        tone === 'danger' && styles.actionDanger,
        tone === 'success' && styles.actionSuccess,
        (pressed || disabled) && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.actionTxt,
          tone === 'danger' && styles.actionTxtDanger,
          tone === 'success' && styles.actionTxtSuccess,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function AdminEmpty({ message }: { message: string }) {
  return <Text style={styles.empty}>{message}</Text>;
}

export function AdminNotesField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder ?? 'Notes'}
      placeholderTextColor={colors.textMuted}
      style={styles.notes}
      multiline
      textAlignVertical="top"
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg, backgroundColor: colors.background },
  scroll: { gap: spacing.md, paddingBottom: spacing.xxxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  error: { color: colors.live, textAlign: 'center', paddingHorizontal: spacing.lg },
  retry: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  retryTxt: { color: colors.gold, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  chipActive: { borderColor: colors.borderStrong, backgroundColor: colors.goldSoft },
  chipTxt: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  chipTxtActive: { color: colors.gold },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  pressed: { opacity: 0.9 },
  rowCopy: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.goldSoft,
  },
  badgeWarn: { backgroundColor: 'rgba(255,59,48,0.12)' },
  badgeTxt: { fontSize: 11, fontWeight: '800', color: colors.gold, textTransform: 'uppercase' },
  badgeTxtWarn: { color: colors.live },
  action: {
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
  },
  actionDanger: { borderColor: 'rgba(255,59,48,0.4)', backgroundColor: 'rgba(255,59,48,0.1)' },
  actionSuccess: { borderColor: 'rgba(52,199,89,0.4)', backgroundColor: 'rgba(52,199,89,0.1)' },
  actionTxt: { fontSize: 14, fontWeight: '800', color: colors.gold },
  actionTxtDanger: { color: colors.live },
  actionTxtSuccess: { color: colors.success },
  disabled: { opacity: 0.45 },
  empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: spacing.xl },
  notes: {
    minHeight: 100,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
});
