import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../../theme';
import type { SanitizedLiveError } from './liveConsoleErrors';

export function LiveConsoleWarningBanner({
  error,
  onRetry,
  retrying,
}: {
  error: SanitizedLiveError;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="warning-outline" size={20} color="#FFB340" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.msg}>{error.userMessage}</Text>
        {error.devDetail ? (
          <Text style={styles.dev} selectable>
            {error.devDetail}
          </Text>
        ) : null}
      </View>
      {onRetry ? (
        <Pressable style={[styles.retry, retrying && styles.retryBusy]} onPress={onRetry} disabled={retrying}>
          <Text style={styles.retryTxt}>{retrying ? '…' : 'Retry'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,149,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.28)',
  },
  msg: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, lineHeight: 18 },
  dev: {
    marginTop: 4,
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  retry: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,179,64,0.5)',
    backgroundColor: 'rgba(255,179,64,0.12)',
  },
  retryBusy: { opacity: 0.6 },
  retryTxt: { fontSize: 12, fontWeight: '800', color: '#FFB340' },
});
