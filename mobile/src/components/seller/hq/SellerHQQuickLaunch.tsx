import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../../theme';
import { hq } from './hqStyles';

export type QuickLaunchId = 'schedule' | 'listing' | 'inventory' | 'vault_events' | 'obs_studio';

const CARDS: {
  id: QuickLaunchId;
  title: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'schedule', title: 'Schedule Vault Event', sub: 'Opens Vault Events · new show', icon: 'calendar' },
  { id: 'listing', title: 'Create Listing', sub: 'List in the Marketplace', icon: 'storefront-outline' },
  { id: 'inventory', title: 'Go to Inventory', sub: 'Listings · drafts · live lots', icon: 'layers-outline' },
  { id: 'vault_events', title: 'Open Vault Events', sub: 'Live · upcoming · past', icon: 'albums-outline' },
  { id: 'obs_studio', title: 'OBS Studio', sub: 'RTMP · widgets · stream settings', icon: 'desktop-outline' },
];

export function SellerHQQuickLaunch({ onAction }: { onAction: (id: QuickLaunchId) => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={hq.sectionEyebrow}>Quick launch</Text>
      <Text style={hq.sectionTitle}>Shortcuts — not show management</Text>
      <View style={styles.grid}>
        {CARDS.map((c) => (
          <Pressable
            key={c.id}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
            onPress={() => onAction(c.id)}
            accessibilityRole="button"
            accessibilityLabel={c.title}
          >
            <LinearGradient
              colors={['rgba(212,175,55,0.12)', 'rgba(12,11,9,0.98)']}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name={c.icon} size={26} color={colors.gold} />
            <Text style={styles.tileTitle}>{c.title}</Text>
            <Text style={styles.tileSub}>{c.sub}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  pressed: { opacity: 0.92 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '48%',
    flexGrow: 1,
    minHeight: 118,
    minWidth: 150,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    overflow: 'hidden',
    padding: spacing.md,
    justifyContent: 'flex-end',
    gap: 6,
  },
  tileTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  tileSub: { fontSize: 11, color: colors.textMuted, lineHeight: 14 },
});
