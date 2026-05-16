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
  liveStatus: string;
  isLive: boolean;
  revenueSnapshot: string;
  followers: string;
  pendingOrders: string;
  upcomingShows: string;
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
  liveStatus,
  isLive,
  revenueSnapshot,
  followers,
  pendingOrders,
  upcomingShows,
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
          {isLive ? (
            <View style={styles.liveDot}>
              <View style={styles.liveDotInner} />
            </View>
          ) : null}
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
          <View style={[styles.livePill, isLive && styles.livePillOn]}>
            <View style={[styles.livePillDot, isLive && styles.livePillDotOn]} />
            <Text style={[styles.livePillTxt, isLive && styles.livePillTxtOn]}>{liveStatus}</Text>
          </View>
        </View>
        {onSettings ? (
          <Pressable onPress={onSettings} hitSlop={12} style={styles.settingsBtn}>
            <Ionicons name="options-outline" size={22} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.metricsRow}>
        <MetricCell label="Revenue vault" value={revenueSnapshot} accent />
        <MetricCell label="Collector network" value={followers} />
        <MetricCell label="Fulfillment" value={pendingOrders} />
        <MetricCell label="Vault events" value={upcomingShows} />
      </View>
      <View style={styles.futureSlot}>
        <Ionicons name="sparkles-outline" size={14} color={colors.textMuted} />
        <Text style={styles.futureTxt}>AI assistant · moderation · live analytics · vault verification — coming</Text>
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
  liveDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.live,
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
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  livePillOn: {
    backgroundColor: colors.liveGlow,
    borderColor: 'rgba(255,59,48,0.45)',
  },
  livePillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted },
  livePillDotOn: { backgroundColor: colors.live },
  livePillTxt: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  livePillTxtOn: { color: '#FF8A80' },
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
