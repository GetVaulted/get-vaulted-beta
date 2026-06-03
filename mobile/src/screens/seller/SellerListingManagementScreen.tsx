import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchListingDetailFromWeb,
  getListingsAccessToken,
  type WebStoredListing,
} from '../../api/webListingsRepository';
import { fetchMyLiveRooms, type LiveRoomApiRow } from '../../api/liveRoomsRepository';
import { SellerListingEndControls } from '../../components/seller/SellerListingEndControls';
import { useAuth } from '../../auth/AuthContext';
import { openCreateListing } from '../../navigation/openCreateListing';
import { openSellerHostRoom } from '../../navigation/openSellerHostRoom';
import { openSellerHQ } from '../../navigation/openSellerHQ';
import { getWebApiBaseUrl } from '../../lib/webApiBaseUrl';
import { notifyListingCatalogChanged } from '../../lib/notifyListingCatalogChanged';
import { publicListingPath } from '../../lib/sellerListingRoutes';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerListingManagement'>;

export function SellerListingManagementScreen({ navigation, route }: Props) {
  const { listingId } = route.params;
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stored, setStored] = useState<WebStoredListing | null>(null);
  const [bidCount, setBidCount] = useState(0);
  const [endRequest, setEndRequest] = useState<import('../../api/listingEndRepository').WebListingEndRequest | null>(null);
  const [priceUsd, setPriceUsd] = useState('');
  const [shippingUsd, setShippingUsd] = useState('');
  const [handlingTime, setHandlingTime] = useState('1–3 business days');
  const [liveRooms, setLiveRooms] = useState<LiveRoomApiRow[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const token = session?.access_token ?? (await getListingsAccessToken());
      const detail = await fetchListingDetailFromWeb(listingId, token);
      if (!detail?.stored) {
        setStored(null);
        return;
      }
      setStored(detail.stored);
      setBidCount(detail.bidCount ?? 0);
      setEndRequest(detail.endRequest);
      const row = detail.stored;
      const displayPrice =
        row.buyingFormat === 'auction'
          ? (row.displayBid ?? row.startingBid ?? row.price ?? '')
          : (row.price ?? '');
      setPriceUsd(String(displayPrice));
      setShippingUsd(String(row.shippingPriceUsd ?? 0));
      setHandlingTime(row.handlingTime ?? '1–3 business days');
    } catch {
      setStored(null);
    } finally {
      setLoading(false);
    }
  }, [listingId, session?.access_token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    void fetchMyLiveRooms(token)
      .then((rows) =>
        setLiveRooms(rows.filter((r) => r.status === 'live' || r.status === 'scheduled').slice(0, 12)),
      )
      .catch(() => setLiveRooms([]));
  }, [session?.access_token]);

  const patchListing = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const token = session?.access_token ?? (await getListingsAccessToken());
      const base = getWebApiBaseUrl();
      const res = await fetch(`${base}/api/listings/${encodeURIComponent(listingId)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? 'Update failed');
      }
      await reload();
      await notifyListingCatalogChanged();
    } catch (e) {
      Alert.alert('Update failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const publicUrl = `${getWebApiBaseUrl() ?? ''}${publicListingPath(listingId)}`;

  const onShare = async () => {
    try {
      await Share.share({ message: publicUrl, url: publicUrl });
    } catch {
      /* user dismissed */
    }
  };

  const onPreview = () => {
    void Linking.openURL(publicUrl);
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.gold} size="large" />
        <Text style={styles.loadingTxt}>Loading Seller Studio…</Text>
      </View>
    );
  }

  if (!stored) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorTitle}>Listing unavailable</Text>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnTxt}>← Back</Text>
        </Pressable>
      </View>
    );
  }

  const thumb = stored.imageDataUrls?.[0];
  const status = stored.status ?? 'active';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.stickyHeader}>
        <Pressable style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.studioLabel}>Vault Seller Studio</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {stored.title}
          </Text>
        </View>
        <Pressable
          style={styles.iconBtn}
          onPress={() => void openCreateListing(navigation, { draftId: listingId })}
        >
          <Ionicons name="create-outline" size={20} color={colors.gold} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]} />
          )}
          <View style={styles.heroBody}>
            <Text style={styles.statusPill}>{status.replace(/_/g, ' ')}</Text>
            <Text style={styles.meta}>
              {stored.buyingFormat === 'auction' ? 'Auction' : 'Buy now'}
              {stored.watchers != null ? ` · ${stored.watchers} watching` : ''}
            </Text>
          </View>
        </View>

        <Section title="Performance">
          <View style={styles.metricsRow}>
          {[
            { label: 'Watchers', value: stored.watchers ?? '—' },
            { label: 'Bids', value: stored.buyingFormat === 'auction' ? bidCount : '—' },
            { label: 'Format', value: stored.buyingFormat === 'auction' ? 'Auction' : 'Buy now' },
            { label: 'Status', value: status.replace(/_/g, ' ') },
          ].map((m) => (
            <View key={m.label} style={styles.metric}>
              <Text style={styles.metricLbl}>{m.label}</Text>
              <Text style={styles.metricVal}>{m.value}</Text>
            </View>
          ))}
          </View>
        </Section>

        <Section title="Listing editor">
          <Text style={styles.hint}>Update title, photos, category, and full listing fields in the create-listing flow.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => void openCreateListing(navigation, { draftId: listingId })}>
            <Text style={styles.primaryBtnTxt}>Edit listing details</Text>
          </Pressable>
        </Section>

        <Section title="Pricing">
          <Text style={styles.fieldLbl}>
            {stored.buyingFormat === 'auction' ? 'Starting / current bid (USD)' : 'Buy now price (USD)'}
          </Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={priceUsd}
            onChangeText={setPriceUsd}
            editable={!(stored.buyingFormat === 'auction' && bidCount > 0)}
            placeholderTextColor={colors.textMuted}
          />
          {stored.buyingFormat === 'auction' && bidCount > 0 ? (
            <Text style={styles.hint}>Starting bid is locked while the auction has active bids.</Text>
          ) : null}
          <Pressable
            style={[styles.primaryBtn, (busy || (stored.buyingFormat === 'auction' && bidCount > 0)) && styles.btnOff]}
            disabled={busy || (stored.buyingFormat === 'auction' && bidCount > 0)}
            onPress={() => {
              const n = Number(priceUsd);
              if (!Number.isFinite(n) || n <= 0) {
                Alert.alert('Invalid price');
                return;
              }
              void patchListing(
                stored.buyingFormat === 'auction' ? { startingBidUsd: n } : { priceUsd: n },
              );
            }}
          >
            <Text style={styles.primaryBtnTxt}>Save pricing</Text>
          </Pressable>
        </Section>

        <Section title="Shipping">
          <Text style={styles.fieldLbl}>Shipping price (USD)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={shippingUsd}
            onChangeText={setShippingUsd}
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.fieldLbl}>Handling time</Text>
          <TextInput
            style={styles.input}
            value={handlingTime}
            onChangeText={setHandlingTime}
            placeholderTextColor={colors.textMuted}
          />
          <Pressable
            style={[styles.primaryBtn, busy && styles.btnOff]}
            disabled={busy}
            onPress={() => {
              const ship = Number(shippingUsd);
              if (!Number.isFinite(ship) || ship < 0) {
                Alert.alert('Invalid shipping price');
                return;
              }
              void patchListing({
                shippingPriceUsd: ship,
                handlingTime: handlingTime.trim() || '1–3 business days',
              });
            }}
          >
            <Text style={styles.primaryBtnTxt}>Save shipping</Text>
          </Pressable>
        </Section>

        <Section title="Inventory">
          <View style={styles.actionRow}>
            {status === 'active' || status === 'auction_live' ? (
              <Pressable
                style={styles.secondaryBtn}
                disabled={busy}
                onPress={() => {
                  Alert.alert('Pause listing?', 'This moves the listing to drafts.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Pause', onPress: () => void patchListing({ status: 'draft' }) },
                  ]);
                }}
              >
                <Text style={styles.secondaryBtnTxt}>Pause</Text>
              </Pressable>
            ) : null}
            {status === 'draft' ? (
              <Pressable
                style={styles.primaryBtn}
                disabled={busy}
                onPress={() =>
                  void patchListing({
                    status: stored.buyingFormat === 'auction' ? 'auction_live' : 'active',
                  })
                }
              >
                <Text style={styles.primaryBtnTxt}>Publish</Text>
              </Pressable>
            ) : null}
            {status !== 'sold' && status !== 'draft' && status !== 'ended' ? (
              <Pressable
                style={styles.secondaryBtn}
                disabled={busy}
                onPress={() => {
                  Alert.alert('Mark as sold?', 'This will mark the listing as sold.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Mark sold', onPress: () => void patchListing({ status: 'sold' }) },
                  ]);
                }}
              >
                <Text style={styles.secondaryBtnTxt}>Mark sold</Text>
              </Pressable>
            ) : null}
          </View>
          <SellerListingEndControls
            listingId={listingId}
            title={stored.title}
            buyingFormat={stored.buyingFormat ?? 'buy_now'}
            listingStatus={status}
            bidCount={bidCount}
            endRequest={endRequest}
            onChanged={() => void reload()}
          />
        </Section>

        <Section title="Assign to live show">
          <Text style={styles.hint}>Queue this lot from your host console during a scheduled or live vault event.</Text>
          {liveRooms.length === 0 ? (
            <Text style={styles.hint}>No scheduled or live rooms yet.</Text>
          ) : (
            liveRooms.map((room) => (
              <View key={room.id} style={styles.liveRoomRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.liveRoomTitle} numberOfLines={1}>
                    {room.title}
                  </Text>
                  <Text style={styles.liveRoomMeta}>{room.status} · {room.roomType}</Text>
                </View>
                <Pressable
                  style={styles.liveRoomBtn}
                  onPress={() => openSellerHostRoom(navigation, room.id)}
                >
                  <Text style={styles.liveRoomBtnTxt}>Host console</Text>
                </Pressable>
              </View>
            ))
          )}
          <Pressable style={styles.secondaryBtn} onPress={() => openSellerHQ(navigation, { tab: 'live' })}>
            <Text style={styles.secondaryBtnTxt}>Manage vault events</Text>
          </Pressable>
        </Section>

        <Section title="Share & promote">
          <Pressable style={styles.primaryBtn} onPress={() => void onShare()}>
            <Ionicons name="share-outline" size={18} color="#0a0a0a" />
            <Text style={styles.primaryBtnTxt}>Share buyer link</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={onPreview}>
            <Text style={styles.secondaryBtnTxt}>Open buyer preview (external)</Text>
          </Pressable>
        </Section>

        <Section title="Archive">
          <Pressable
            style={styles.dangerBtn}
            disabled={busy}
            onPress={() => {
              Alert.alert('Delete listing?', 'This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    void (async () => {
                      setBusy(true);
                      try {
                        const token = session?.access_token ?? (await getListingsAccessToken());
                        const base = getWebApiBaseUrl();
                        const res = await fetch(`${base}/api/listings/${encodeURIComponent(listingId)}`, {
                          method: 'DELETE',
                          headers: { Authorization: `Bearer ${token}` },
                        });
                        if (!res.ok) throw new Error('Delete failed');
                        await notifyListingCatalogChanged();
                        navigation.goBack();
                      } catch (e) {
                        Alert.alert('Delete failed', e instanceof Error ? e.message : 'Try again.');
                      } finally {
                        setBusy(false);
                      }
                    })();
                  },
                },
              ]);
            }}
          >
            <Text style={styles.dangerBtnTxt}>Delete listing</Text>
          </Pressable>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: spacing.md },
  loadingTxt: { ...typography.body, color: colors.textSecondary },
  errorTitle: { ...typography.title, color: colors.textPrimary },
  backBtn: { padding: spacing.md },
  backBtnTxt: { color: colors.gold, fontWeight: '700' },
  stickyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: 'rgba(5,5,7,0.95)',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, minWidth: 0 },
  studioLabel: {
    ...typography.micro,
    color: colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  headerTitle: { ...typography.subtitle, color: colors.textPrimary },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxxl, gap: spacing.md },
  hero: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  thumb: { width: 88, height: 88, borderRadius: radii.md },
  thumbEmpty: { backgroundColor: colors.surface },
  heroBody: { flex: 1, justifyContent: 'center', gap: spacing.xs },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.12)',
    color: colors.gold,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  meta: { ...typography.caption, color: colors.textSecondary },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 120,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
  },
  metricLbl: { ...typography.micro, color: colors.textMuted, textTransform: 'uppercase' },
  metricVal: { marginTop: 4, fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  section: {
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  primaryBtnTxt: { color: '#0a0a0a', fontWeight: '800', fontSize: 14 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  secondaryBtnTxt: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
  fieldLbl: { ...typography.caption, color: colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  hint: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  dangerBtn: {
    backgroundColor: 'rgba(139,46,46,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.4)',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  dangerBtnTxt: { color: '#ffb4a8', fontWeight: '800' },
  btnOff: { opacity: 0.5 },
  liveRoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  liveRoomTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  liveRoomMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  liveRoomBtn: {
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  liveRoomBtnTxt: { fontSize: 11, fontWeight: '800', color: colors.gold },
});
