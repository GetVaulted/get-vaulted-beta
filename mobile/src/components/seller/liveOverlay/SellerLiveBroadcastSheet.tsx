import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StreamAdvancedPanel } from '../liveConsole/StreamAdvancedPanel';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { colors, radii, spacing } from '../../../theme';

export function SellerLiveBroadcastSheet({
  visible,
  onClose,
  streamConnected,
  serverUrl,
  streamKey,
  revealKey,
  onToggleReveal,
  onConnectSource,
  onRefresh,
  onRotateKey,
  busy,
  hasIngest,
  zoomStops,
  cameraZoom,
  onSetZoom,
}: {
  visible: boolean;
  onClose: () => void;
  streamConnected: boolean;
  serverUrl: string | null;
  streamKey: string | null;
  revealKey: boolean;
  onToggleReveal: () => void;
  onConnectSource: () => void;
  onRefresh: () => void;
  onRotateKey: () => void;
  busy: 'provision' | 'rotate' | 'refresh' | null;
  hasIngest: boolean;
  /** Zoom stops the current camera supports (e.g. [0.5, 1, 2, 3]); zoom UI hides when 1 or none. */
  zoomStops?: number[];
  cameraZoom?: number;
  onSetZoom?: (factor: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const stops = (zoomStops ?? []).filter((s) => typeof s === 'number' && Number.isFinite(s) && s > 0);
  const showZoom = stops.length > 1 && !!onSetZoom;
  const activeZoom = cameraZoom ?? 1;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss broadcast settings" />
        <View style={[styles.drawer, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>{SELLER_CONSOLE.obsSetup}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.sub}>{SELLER_CONSOLE.liveLeaveAppHint}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {showZoom ? (
              <View style={styles.zoomSection}>
                <Text style={styles.zoomLabel}>Camera zoom</Text>
                <Text style={styles.zoomHint}>Zoom the live feed. 0.5x uses the wide-angle lens.</Text>
                <View style={styles.zoomRow}>
                  {stops.map((stop) => {
                    const selected = Math.abs(stop - activeZoom) < 0.01;
                    return (
                      <Pressable
                        key={stop}
                        onPress={() => onSetZoom?.(stop)}
                        style={[styles.zoomPill, selected && styles.zoomPillActive]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Zoom ${stop}x`}
                      >
                        <Text style={[styles.zoomPillText, selected && styles.zoomPillTextActive]}>
                          {`${stop}x`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
            <StreamAdvancedPanel
              streamConnected={streamConnected}
              serverUrl={serverUrl}
              streamKey={streamKey}
              revealKey={revealKey}
              onToggleReveal={onToggleReveal}
              onConnectSource={onConnectSource}
              onRefresh={onRefresh}
              onRotateKey={onRotateKey}
              busy={busy}
              hasIngest={hasIngest}
              expandSignal={visible ? 1 : 0}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  drawer: {
    maxHeight: '72%',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  sub: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginBottom: spacing.md,
  },
  zoomSection: {
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  zoomLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  zoomHint: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm },
  zoomRow: { flexDirection: 'row', gap: spacing.sm },
  zoomPill: {
    minWidth: 52,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  zoomPillActive: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  zoomPillText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  zoomPillTextActive: { color: '#000000' },
});
