import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../../theme';
import { hq } from './hqStyles';

type Props = {
  displayName: string;
  handle: string;
  avatarUrl?: string | null;
  rankLabel: string;
  revenueSnapshot: string;
  activeCollectors: string;
  pendingOrders: string;
  performanceInsight: string;
  onSettings?: () => void;
};

function MetricCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.metricCell}>
      <Text style={[styles.metricVal, accent && styles.metricValAccent]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.metricLbl} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function SellerHQCommandHeader({
  displayName,
  handle,
  avatarUrl,
  rankLabel,
  revenueSnapshot,
  activeCollectors,
  pendingOrders,
  performanceInsight,
  onSettings,
}: Props) {
  return (
    <View style={[styles.shell, hq.goldCard]}>
      <LinearGradient
        colors={['rgba(212,175,55,0.14)', 'rgba(10,10,12,0.98)', 'rgba(5,5,5,1)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.top}>
        <View style={styles.avatarWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPh]}>
              <Ionicons name="person" size={28} color={colors.gold} />
            </View>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.rankRow}>
            <Ionicons name="diamond-outline" size={12} color={colors.gold} />
            <Text style={styles.rank}>{rankLabel}</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.handle} numberOfLines={1}>
            {handle}
          </Text>
          <Text style={styles.studioTag}>Seller operating system</Text>
        </View>
        {onSettings ? (
          <Pressable onPress={onSettings} hitSlop={12} style={styles.settingsBtn}>
            <Ionicons name="options-outline" size={22} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.metricsRow}>
        <MetricCell label="Revenue vault" value={revenueSnapshot} accent />
        <MetricCell label="Collector network" value={activeCollectors} />
        <MetricCell label="Fulfillment" value={pendingOrders} />
        <MetricCell label="Performance" value={performanceInsight} />
      </View>
      <View style={styles.futureSlot}>
        <Ionicons name="sparkles-outline" size={14} color={colors.textMuted} />
        <Text style={styles.futureTxt}>AI growth tools · reputation · insights — coming to Studio</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { padding: spacing.md, gap: spacing.md, overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(212,175,55,0.5)',
  },
  avatarPh: {
    backgroundColor: 'rgba(212,175,55,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rank: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  name: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginTop: 4 },
  handle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  studioTag: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 8,
  },
  settingsBtn: {
    padding: 8,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricCell: {
    flex: 1,
    minWidth: '45%',
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  metricVal: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  metricValAccent: { color: colors.gold },
  metricLbl: { fontSize: 10, color: colors.textMuted, marginTop: 4, fontWeight: '600' },
  futureSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  futureTxt: { flex: 1, fontSize: 11, color: colors.textMuted, lineHeight: 15 },
});
