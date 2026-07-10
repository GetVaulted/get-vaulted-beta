import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCreateListingDraft } from '../../../createListing/CreateListingDraftContext';
import type { ListingChannel } from '../../../createListing/listingChannel';
import { LISTING_CHANNEL_CONFIG } from '../../../createListing/listingChannel';
import type { ListingPreview } from '../../../createListing/types';
import type { useSellerInventory } from '../../../hooks/useSellerInventory';
import {
  bucketListings,
  countBucket,
  defaultInventoryBucketForChannel,
  INVENTORY_BUCKET_LABELS,
  type InventoryBucket,
} from '../../../lib/sellerInventoryBuckets';
import { openCreateListing } from '../../../navigation/openCreateListing';
import { openSellerListingManagementFromTab } from '../../../navigation/openSellerListingManagement';
import type { MainTabParamList } from '../../../navigation/types';
import { colors, radii, spacing } from '../../../theme';

const CHANNEL_TABS: ListingChannel[] = ['marketplace', 'live_show'];
const BUCKETS: InventoryBucket[] = ['active', 'drafts', 'sold'];

function statusStyle(status: ListingPreview['status']) {
  switch (status) {
    case 'active':
      return { bg: 'rgba(52,199,89,0.15)', fg: colors.success, label: 'Active' };
    case 'draft':
      return { bg: 'rgba(255,255,255,0.06)', fg: colors.textSecondary, label: 'Draft' };
    case 'sold':
      return { bg: 'rgba(212,175,55,0.12)', fg: colors.gold, label: 'Sold' };
    case 'expiring':
      return { bg: 'rgba(255,149,0,0.15)', fg: '#FFB340', label: 'Ending' };
    case 'pending':
      return { bg: 'rgba(100,149,237,0.15)', fg: '#8EBBFF', label: 'Pending' };
    case 'in_auction':
      return { bg: 'rgba(212,175,55,0.15)', fg: colors.gold, label: 'In auction' };
    case 'ended':
      return { bg: 'rgba(255,255,255,0.08)', fg: colors.textMuted, label: 'Ended' };
    default:
      return { bg: 'rgba(255,255,255,0.06)', fg: colors.textMuted, label: status };
  }
}

function mergeInventoryListings(
  remote: ListingPreview[],
  localPreviews: ListingPreview[],
): ListingPreview[] {
  const map = new Map<string, ListingPreview>();
  for (const row of remote) map.set(row.id, row);
  for (const row of localPreviews) {
    if (row.status === 'draft' || !map.has(row.id)) map.set(row.id, row);
  }
  return [...map.values()];
}

export function SellerInventoryPanel({
  navigation,
  inventory,
}: {
  navigation: BottomTabNavigationProp<MainTabParamList>;
  inventory: ReturnType<typeof useSellerInventory>;
}) {
  const { drafts, userListings } = useCreateListingDraft();
  const [channelTab, setChannelTab] = useState<ListingChannel>('marketplace');
  const [bucketTab, setBucketTab] = useState<InventoryBucket>('active');

  const merged = useMemo(
    () => mergeInventoryListings(inventory.all ?? [...inventory.marketplace, ...inventory.liveShow], userListings),
    [inventory.all, inventory.liveShow, inventory.marketplace, userListings],
  );

  const cfg = LISTING_CHANNEL_CONFIG[channelTab];
  const visible = bucketListings(merged, channelTab, bucketTab);
  const openNew = () => {
    void openCreateListing(navigation as unknown as NavigationProp<ParamListBase>, { channel: channelTab });
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.intro}>Separate lanes for marketplace storefront and live show queue.</Text>

      <View style={styles.channelRow}>
        {CHANNEL_TABS.map((ch) => {
          const on = channelTab === ch;
          const chCfg = LISTING_CHANNEL_CONFIG[ch];
          return (
            <Pressable
              key={ch}
              style={[styles.channelTab, on && { borderColor: chCfg.border, backgroundColor: chCfg.fill }]}
              onPress={() => {
                setChannelTab(ch);
                setBucketTab(defaultInventoryBucketForChannel(ch));
              }}
            >
              <Ionicons name={chCfg.icon} size={16} color={on ? chCfg.primary : colors.textMuted} />
              <Text style={[styles.channelTabTxt, on && { color: chCfg.primary }]}>
                {ch === 'marketplace' ? 'Marketplace' : 'Live show'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.bucketRow}>
        {BUCKETS.map((bucket) => {
          const on = bucketTab === bucket;
          const count = countBucket(merged, channelTab, bucket);
          return (
            <Pressable
              key={bucket}
              style={[styles.bucketChip, on && styles.bucketChipOn]}
              onPress={() => setBucketTab(bucket)}
            >
              <Text style={[styles.bucketChipTxt, on && styles.bucketChipTxtOn]}>
                {INVENTORY_BUCKET_LABELS[bucket]} ({count})
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.listHead}>
        <Text style={styles.listTitle}>
          {INVENTORY_BUCKET_LABELS[bucketTab]} · {cfg.shortLabel}
        </Text>
        <Pressable style={[styles.newBtn, { backgroundColor: cfg.primary }]} onPress={openNew}>
          <Ionicons name="add" size={18} color="#0a0a0a" />
          <Text style={styles.newBtnTxt}>New</Text>
        </Pressable>
      </View>

      {inventory.loading && !inventory.loadedOnce ? (
        <ActivityIndicator color={cfg.primary} style={{ marginVertical: spacing.lg }} />
      ) : null}

      {!inventory.loading && visible.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: cfg.border }]}>
          <Text style={styles.emptyTitle}>No {INVENTORY_BUCKET_LABELS[bucketTab].toLowerCase()} listings</Text>
          <Text style={styles.emptyBody}>
            {bucketTab === 'drafts'
              ? 'Save a draft anytime while creating a listing.'
              : bucketTab === 'sold'
                ? 'Sold items from this lane will appear here.'
                : channelTab === 'live_show'
                  ? 'Queue lots before you go live.'
                  : 'Publish listings to your marketplace storefront.'}
          </Text>
          {bucketTab !== 'sold' ? (
            <Pressable style={[styles.emptyCta, { borderColor: cfg.border }]} onPress={openNew}>
              <Text style={[styles.emptyCtaTxt, { color: cfg.primary }]}>Create listing</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.grid}>
        {visible.map((L) => {
          const st = statusStyle(L.status);
          return (
            <Pressable
              key={L.id}
              style={styles.card}
              onPress={() => {
                if (L.status === 'draft') {
                  const hasDraft = drafts.some((d) => d.id === L.id);
                  void openCreateListing(
                    navigation as unknown as NavigationProp<ParamListBase>,
                    hasDraft ? { draftId: L.id } : { channel: channelTab },
                  );
                  return;
                }
                openSellerListingManagementFromTab(navigation, L.id);
              }}
            >
              {L.imageUrl ? (
                <Image source={{ uri: L.imageUrl }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {L.title}
                </Text>
                <Text style={styles.cardPrice}>{L.price}</Text>
                <View style={styles.cardFoot}>
                  <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusPillTxt, { color: st.fg }]}>{st.label}</Text>
                  </View>
                  {L.watches > 0 ? <Text style={styles.watch}>{L.watches} watching</Text> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  intro: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  channelRow: { flexDirection: 'row', gap: spacing.sm },
  channelTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.surfaceElevated,
  },
  channelTabTxt: { color: colors.textMuted, fontWeight: '800', fontSize: 13 },
  bucketRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  bucketChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: colors.surface,
  },
  bucketChipOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.1)' },
  bucketChipTxt: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  bucketChipTxtOn: { color: colors.gold },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  listTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', flex: 1 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  newBtnTxt: { color: '#0a0a0a', fontWeight: '800', fontSize: 13 },
  emptyCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  emptyTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  emptyBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  emptyCta: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  emptyCtaTxt: { fontWeight: '800', fontSize: 13 },
  grid: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.surfaceElevated,
  },
  thumb: { width: 96, height: 108, backgroundColor: colors.surface },
  thumbEmpty: { backgroundColor: '#111' },
  cardBody: { flex: 1, padding: spacing.md, justifyContent: 'space-between' },
  cardTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 14, lineHeight: 18 },
  cardPrice: { color: colors.gold, fontWeight: '800', fontSize: 15, marginTop: 4 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  statusPillTxt: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  watch: { color: colors.textMuted, fontSize: 11 },
});
