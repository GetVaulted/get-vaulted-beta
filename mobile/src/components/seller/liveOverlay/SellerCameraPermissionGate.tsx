import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../../theme';

type Props = {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
};

export function SellerCameraPermissionGate({ message, onRetry, retrying }: Props) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.msg}>{message}</Text>
        <Pressable style={[styles.retry, retrying && styles.retryBusy]} onPress={onRetry} disabled={retrying}>
          <Text style={styles.retryTxt}>{retrying ? 'Opening camera…' : 'Retry permission'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    zIndex: 2,
  },
  card: {
    maxWidth: 320,
    width: '100%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
    gap: spacing.sm,
  },
  title: {
    color: 'rgba(255,255,255,0.96)',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  msg: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  retry: {
    marginTop: spacing.xs,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  retryBusy: { opacity: 0.6 },
  retryTxt: {
    color: '#0a0a0a',
    fontWeight: '800',
    fontSize: 13,
  },
});
