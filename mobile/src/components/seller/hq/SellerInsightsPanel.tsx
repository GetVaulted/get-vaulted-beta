import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SellerLayawayCounts } from '../../../api/layawayRepository';
import type { SellerAnalyticsSnapshot } from '../../../api/sellerAnalyticsRepository';
import type { SellerHubTabId } from '../../../data/sellerHubMock';
import type { useSellerInventory } from '../../../hooks/useSellerInventory';
import { countBucket } from '../../../lib/sellerInventoryBuckets';
import { colors, radii, spacing } from '../../../theme';
import { hq } from './hqStyles';
import { StudioSection } from './SellerStudioUI';

type CommandMetrics = {
  performanceInsight: string;
  sellThrough: string;
  pendingOrders: string;
  activeViewers: string;
  conversion: string;
  activeCollectors: string;
};

function InsightTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLbl}>{label}</Text>
      <Text style={[styles.tileVal, accent && styles.tileValAccent]} numberOfLines={2}>
        {value}
      </Text>
      {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
    </View>
  );
}

function ChannelRow({
  icon,
  label,
  active,
  drafts,
  sold,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: number;
  drafts: number;
  sold: number;
  tint: string;
}) {
  return (
    <View style={styles.channelRow}>
      <View style={[styles.channelIcon, { borderColor: `${tint}44`, backgroundColor: `${tint}14` }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.channelLbl}>{label}</Text>
        <Text style={styles.channelSub}>
          {active} active · {drafts} draft{drafts === 1 ? '' : 's'} · {sold} sold
        </Text>
      </View>
    </View>
  );
}

function QuickLink({
  label,
  detail,
  icon,
  onPress,
  tone = 'default',
}: {
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tone?: 'default' | 'warn' | 'live';
}) {
  const iconColor = tone === 'warn' ? '#FFB340' : tone === 'live' ? colors.live : colors.gold;
  return (
    <Pressable style={({ pressed }) => [styles.quickLink, pressed && styles.quickLinkPressed]} onPress={onPress}>
      <View style={[styles.quickIcon, { borderColor: `${iconColor}33` }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.quickLbl}>{label}</Text>
        <Text style={styles.quickDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

export function SellerInsightsPanel({
  analytics,
  metrics,
  inventory,
  layawayCounts,
  liveCount,
  upcomingCount,
  onOpenTab,
}: {
  analytics: SellerAnalyticsSnapshot;
  metrics: CommandMetrics;
  inventory: ReturnType<typeof useSellerInventory>;
  layawayCounts?: SellerLayawayCounts | null;
  liveCount: number;
  upcomingCount: number;
  onOpenTab: (tab: SellerHubTabId) => void;
}) {
  const listings = inventory.all ?? [...inventory.marketplace, ...inventory.liveShow];

  const marketplaceStats = useMemo(
    () => ({
      active: countBucket(listings, 'marketplace', 'active'),
      drafts: countBucket(listings, 'marketplace', 'drafts'),
      sold: countBucket(listings, 'marketplace', 'sold'),
    }),
    [listings],
  );

  const liveShowStats = useMemo(
    () => ({
      active: countBucket(listings, 'live_show', 'active'),
      drafts: countBucket(listings, 'live_show', 'drafts'),
      sold: countBucket(listings, 'live_show', 'sold'),
    }),
    [listings],
  );

  const hasData =
    analytics.activeListings > 0 ||
    analytics.completedSales > 0 ||
    analytics.liveViewerTotal > 0 ||
    analytics.reviewCount > 0 ||
    analytics.followers > 0 ||
    analytics.completedTrades > 0 ||
    analytics.pendingFulfillment > 0 ||
    (layawayCounts?.active ?? 0) > 0;

  const ratingLabel =
    analytics.reviewCount > 0
      ? `${analytics.averageRating.toFixed(1)}★ · ${analytics.reviewCount} review${analytics.reviewCount === 1 ? '' : 's'}`
      : 'No reviews yet';

  return (
    <View style={styles.wrap}>
      <Text style={styles.intro}>
        Performance across listings, fulfillment, live shows, and collector reputation — money details live under Revenue.
      </Text>

      <View style={[styles.hero, hq.goldCard]}>
        <LinearGradient
          colors={['rgba(212,175,55,0.16)', 'rgba(10,10,12,0.98)', 'rgba(5,5,5,1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroEyebrowRow}>
          <Ionicons name="pulse-outline" size={14} color={colors.gold} />
          <Text style={styles.heroEyebrow}>Performance snapshot</Text>
        </View>
        <Text style={styles.heroInsight}>{metrics.performanceInsight}</Text>
        <Text style={styles.heroSub}>{metrics.sellThrough !== '—' ? metrics.sellThrough : 'Start listing to track sell-through'}</Text>
        <View style={styles.heroTiles}>
          <InsightTile label="Completed sales" value={String(analytics.completedSales)} accent />
          <InsightTile label="To ship" value={String(analytics.pendingFulfillment)} hint="Open fulfillment" />
          <InsightTile label="Followers" value={metrics.activeCollectors} />
          <InsightTile
            label="Live reach"
            value={analytics.liveViewerTotal > 0 ? String(analytics.liveViewerTotal) : '—'}
            hint={analytics.liveShowsLive > 0 ? `${analytics.liveShowsLive} show live` : undefined}
          />
        </View>
      </View>

      {!hasData ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Insights unlock as you sell</Text>
          <Text style={styles.emptyBody}>
            List inventory, fulfill orders, and host live events — your performance metrics will populate here.
          </Text>
          <Pressable style={styles.emptyCta} onPress={() => onOpenTab('listings')}>
            <Text style={styles.emptyCtaTxt}>Go to Inventory</Text>
          </Pressable>
        </View>
      ) : null}

      <StudioSection title="Fulfillment & layaways" subtitle="Orders that still need your attention">
        <View style={styles.tileGrid}>
          <InsightTile
            label="Awaiting ship"
            value={String(analytics.pendingFulfillment)}
            hint={
              analytics.pendingFulfillment > 0 ? 'Paid, awaiting label / shipment' : 'All caught up'
            }
            accent={analytics.pendingFulfillment > 0}
          />
          <InsightTile
            label="Active layaways"
            value={String(layawayCounts?.active ?? 0)}
            hint={(layawayCounts?.active ?? 0) > 0 ? 'Reserved sales in progress' : 'None active'}
          />
        </View>
        {analytics.pendingFulfillment > 0 || (layawayCounts?.active ?? 0) > 0 ? (
          <QuickLink
            label="Open fulfillment"
            detail={
              analytics.pendingFulfillment > 0
                ? `${analytics.pendingFulfillment} order${analytics.pendingFulfillment === 1 ? '' : 's'} to ship`
                : `${layawayCounts?.active ?? 0} active layaway${(layawayCounts?.active ?? 0) === 1 ? '' : 's'}`
            }
            icon="cube-outline"
            tone={analytics.pendingFulfillment > 0 ? 'warn' : 'default'}
            onPress={() => onOpenTab('orders')}
          />
        ) : null}
      </StudioSection>

      <StudioSection title="Inventory lanes" subtitle="Marketplace vs live show — separate counts">
        <ChannelRow
          icon="storefront-outline"
          label="Marketplace"
          active={marketplaceStats.active}
          drafts={marketplaceStats.drafts}
          sold={marketplaceStats.sold}
          tint="#6EB5FF"
        />
        <ChannelRow
          icon="radio-outline"
          label="Live show"
          active={liveShowStats.active}
          drafts={liveShowStats.drafts}
          sold={liveShowStats.sold}
          tint={colors.live}
        />
        <QuickLink
          label="Manage inventory"
          detail={`${marketplaceStats.active + liveShowStats.active} active listings across both lanes`}
          icon="layers-outline"
          onPress={() => onOpenTab('listings')}
        />
      </StudioSection>

      <StudioSection title="Live performance" subtitle="Shows and real-time audience">
        <View style={styles.tileGrid}>
          <InsightTile
            label="Live now"
            value={liveCount > 0 ? 'On air' : '—'}
            hint={liveCount > 0 ? `${analytics.liveViewerTotal} viewer${analytics.liveViewerTotal === 1 ? '' : 's'}` : 'No show live'}
            accent={liveCount > 0}
          />
          <InsightTile
            label="Scheduled"
            value={upcomingCount > 0 ? String(upcomingCount) : '—'}
            hint={upcomingCount > 0 ? 'Upcoming vault events' : 'Nothing scheduled'}
          />
          <InsightTile label="Completed trades" value={String(analytics.completedTrades)} />
          <InsightTile label="Engagement" value={metrics.conversion} hint="Live activity signal" />
        </View>
        <QuickLink
          label="Vault events"
          detail={
            liveCount > 0
              ? 'You’re live — open event controls'
              : upcomingCount > 0
                ? `${upcomingCount} scheduled show${upcomingCount === 1 ? '' : 's'}`
                : 'Schedule or launch a show'
          }
          icon={liveCount > 0 ? 'radio-outline' : 'calendar-outline'}
          tone={liveCount > 0 ? 'live' : 'default'}
          onPress={() => onOpenTab('live')}
        />
      </StudioSection>

      <StudioSection title="Reputation & audience" subtitle="Trust signals collectors see">
        <View style={styles.tileGrid}>
          <InsightTile label="Vault rating" value={ratingLabel} accent={analytics.reviewCount > 0} />
          <InsightTile label="Followers" value={metrics.activeCollectors} hint="Collector network size" />
        </View>
      </StudioSection>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  intro: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  hero: { padding: spacing.lg, gap: spacing.sm },
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroEyebrow: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroInsight: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
    lineHeight: 28,
    marginTop: spacing.xs,
  },
  heroSub: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  heroTiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  tile: {
    flexGrow: 1,
    flexBasis: '44%',
    minWidth: 130,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  tileLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tileVal: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  tileValAccent: { color: colors.gold },
  tileHint: { marginTop: 4, fontSize: 10, color: colors.textMuted, lineHeight: 14 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  channelIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  channelLbl: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  channelSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 17 },
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  quickLinkPressed: { opacity: 0.85 },
  quickIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  quickLbl: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  quickDetail: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  emptyCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  emptyBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  emptyCta: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  emptyCtaTxt: { color: colors.gold, fontWeight: '800', fontSize: 13 },
});
