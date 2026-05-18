import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StreamAdvancedPanel } from '../liveConsole/StreamAdvancedPanel';
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
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss broadcast settings" />
        <View style={[styles.drawer, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>Broadcast settings</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.sub}>
            RTMP / IVS ingest is for OBS or Larix. Your buyers always see the live feed — not this panel.
          </Text>
          <ScrollView showsVerticalScrollIndicator={false}>
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
});
