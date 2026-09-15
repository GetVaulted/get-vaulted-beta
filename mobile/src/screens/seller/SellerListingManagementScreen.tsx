import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { SellerListingEndControls } from '../../components/seller/SellerListingEndControls';
import {
  StudioFieldLabel,
  StudioMetricTile,
  StudioPrimaryButton,
  StudioSecondaryButton,
  StudioSection,
  studioStyles,
} from '../../components/seller/hq/SellerStudioUI';
import { useAuth } from '../../auth/AuthContext';
import { openCreateListing } from '../../navigation/openCreateListing';
import { getWebApiBaseUrl } from '../../lib/webApiBaseUrl';
import { notifyListingCatalogChanged } from '../../lib/notifyListingCatalogChanged';
import { canonicalListingShareUrl } from '../../lib/shareListingNative';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerListingManagement'>;

type SellerListingOffer = {
  id: string;
  buyerUsername: string | null;
  amountUsd: number;
  message: string | null;
  status: string;
  counterAmountUsd: number | null;
};

export function SellerListingManagementScreen({ navigation, route }: Props) {
  const { listingId, offerId: deepLinkOfferId } = route.params;
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

  const [offers, setOffers] = useState<SellerListingOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [offerBusyId, setOfferBusyId] = useState<string | null>(null);

  const loadOffers = useCallback(async () => {
    setOffersLoading(true);
    setOffersError(null);
    try {
      const token = session?.access_token ?? (await getListingsAccessToken());
      const base = getWebApiBaseUrl();
      const res = await fetch(`${base}/api/listings/${encodeURIComponent(listingId)}/offers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load offers');
      const body = (await res.json().catch(() => null)) as { offers?: SellerListingOffer[] } | null;
      setOffers(Array.isArray(body?.offers) ? body.offers : []);
    } catch {
      setOffers([]);
      setOffersError('Could not load offers for this listing.');
    } finally {
      setOffersLoading(false);
    }
  }, [listingId, session?.access_token]);

  useEffect(() => {
    void loadOffers();
  }, [loadOffers]);

  const pendingOffers = offers.filter((o) => o.status === 'pending');
  const highlightedOffer =
    (deepLinkOfferId ? offers.find((o) => o.id === deepLinkOfferId) : null) ?? pendingOffers[0] ?? null;

  const resolveOffer = async (targetOfferId: string, action: 'accept' | 'decline') => {
    setOfferBusyId(targetOfferId);
    try {
      const token = session?.access_token ?? (await getListingsAccessToken());
      const base = getWebApiBaseUrl();
      const res = await fetch(`${base}/api/offers/${encodeURIComponent(targetOfferId)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'Could not update this offer.');
      await loadOffers();
      if (action === 'accept') await reload();
    } catch (e) {
      Alert.alert('Offer', e instanceof Error ? e.message : 'Could not update this offer.');
    } finally {
      setOfferBusyId(null);
    }
  };

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

  // Always the production site (never a beta/preview API host) so a seller never
  // accidentally shares a beta link with potential buyers — mirrors shareListingNative.ts.
  const publicUrl = canonicalListingShareUrl(listingId) ?? '';

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
      <View style={[studioStyles.screenBg, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.gold} size="large" />
        <Text style={styles.loadingTxt}>Loading listing…</Text>
      </View>
    );
  }

  if (!stored) {
    return (
      <View style={[studioStyles.screenBg, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorTitle}>Listing unavailable</Text>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnTxt}>← Back</Text>
        </Pressable>
      </View>
    );
  }

  const thumb = stored.imageDataUrls?.[0];
  const status = stored.status ?? 'active';
  const priceLocked = stored.buyingFormat === 'auction' && bidCount > 0;

  return (
    <View style={[studioStyles.screenBg, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={['rgba(212,175,55,0.1)', 'rgba(5,5,5,0.98)', colors.background]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      <View style={studioStyles.header}>
        <Pressable style={studioStyles.headerBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={studioStyles.headerCenter}>
          <Text style={studioStyles.headerKicker}>Seller Studio</Text>
          <Text style={studioStyles.headerTitle} numberOfLines={1}>
            {stored.title}
          </Text>
        </View>
        <Pressable
          style={studioStyles.headerBtn}
          onPress={() => void openCreateListing(navigation, { draftId: listingId })}
          accessibilityLabel="Edit listing"
        >
          <Ionicons name="create-outline" size={20} color={colors.gold} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={studioStyles.scroll} showsVerticalScrollIndicator={false}>
        <View style={studioStyles.heroCard}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={studioStyles.heroThumb} />
          ) : (
            <View style={[studioStyles.heroThumb, styles.thumbEmpty]} />
          )}
          <View style={studioStyles.heroBody}>
            <View style={studioStyles.statusPill}>
              <Text style={studioStyles.statusPillText}>{status.replace(/_/g, ' ')}</Text>
            </View>
            <Text style={studioStyles.heroMeta}>
              {stored.buyingFormat === 'auction' ? 'Auction' : 'Buy now'}
              {stored.watchers != null ? ` · ${stored.watchers} watching` : ''}
            </Text>
          </View>
        </View>

        <StudioSection
          title="Offers"
          subtitle={
            pendingOffers.length > 0
              ? `${pendingOffers.length} pending`
              : 'Cash offers on this listing'
          }
        >
          {offersLoading ? (
            <ActivityIndicator color={colors.gold} />
          ) : offersError ? (
            <Text style={studioStyles.hint}>{offersError}</Text>
          ) : pendingOffers.length === 0 ? (
            <Text style={studioStyles.hint}>
              {deepLinkOfferId && !highlightedOffer
                ? 'This offer could not be found. It may have already been resolved.'
                : 'No pending offers yet. When a buyer makes an offer, Accept and Decline appear here.'}
            </Text>
          ) : (
            pendingOffers.map((offer) => {
              const busy = offerBusyId === offer.id;
              const isFocus = highlightedOffer?.id === offer.id;
              return (
                <View
                  key={offer.id}
                  style={[styles.offerCard, isFocus && styles.offerCardFocus]}
                >
                  <Text style={styles.offerAmount}>
                    ${offer.amountUsd.toLocaleString('en-US')}
                    {offer.buyerUsername ? ` from @${offer.buyerUsername}` : ''}
                  </Text>
                  {offer.message ? (
                    <Text style={styles.offerMessage}>&ldquo;{offer.message}&rdquo;</Text>
                  ) : null}
                  <Text style={styles.offerStatus}>Status: {offer.status.replace(/_/g, ' ')}</Text>
                  <View style={studioStyles.actionRow}>
                    <StudioPrimaryButton
                      label="Accept"
                      disabled={busy || !!offerBusyId}
                      onPress={() =>
                        Alert.alert('Accept this offer?', 'This creates an order at the offer amount.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Accept', onPress: () => void resolveOffer(offer.id, 'accept') },
                        ])
                      }
                    />
                    <StudioSecondaryButton
                      label="Decline"
                      disabled={busy || !!offerBusyId}
                      onPress={() =>
                        Alert.alert('Decline this offer?', undefined, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Decline',
                            style: 'destructive',
                            onPress: () => void resolveOffer(offer.id, 'decline'),
                          },
                        ])
                      }
                    />
                  </View>
                </View>
              );
            })
          )}
        </StudioSection>

        <View style={studioStyles.quickRow}>
          <StudioSecondaryButton
            label="Edit"
            icon="create-outline"
            onPress={() => void openCreateListing(navigation, { draftId: listingId })}
          />
          <StudioSecondaryButton label="Share" icon="share-outline" onPress={() => void onShare()} />
          <StudioSecondaryButton label="Preview" icon="open-outline" onPress={onPreview} />
        </View>

        <StudioSection title="Performance">
          <View style={studioStyles.metricGrid}>
            <StudioMetricTile label="Watchers" value={stored.watchers ?? '—'} />
            <StudioMetricTile label="Bids" value={stored.buyingFormat === 'auction' ? bidCount : '—'} />
            <StudioMetricTile label="Format" value={stored.buyingFormat === 'auction' ? 'Auction' : 'Buy now'} />
            <StudioMetricTile label="Status" value={status.replace(/_/g, ' ')} />
          </View>
        </StudioSection>

        <StudioSection
          title="Pricing"
          subtitle={priceLocked ? 'Starting bid is locked while bids are active.' : undefined}
        >
          <StudioFieldLabel>
            {stored.buyingFormat === 'auction' ? 'Starting / current bid (USD)' : 'Buy now price (USD)'}
          </StudioFieldLabel>
          <TextInput
            style={studioStyles.fieldInput}
            keyboardType="decimal-pad"
            value={priceUsd}
            onChangeText={setPriceUsd}
            editable={!priceLocked}
            placeholderTextColor={colors.textMuted}
          />
          <StudioPrimaryButton
            label="Save pricing"
            disabled={busy || priceLocked}
            onPress={() => {
              const n = Number(priceUsd);
              if (!Number.isFinite(n) || n <= 0) {
                Alert.alert('Invalid price');
                return;
              }
              void patchListing(stored.buyingFormat === 'auction' ? { startingBidUsd: n } : { priceUsd: n });
            }}
          />
        </StudioSection>

        <StudioSection title="Shipping">
          <StudioFieldLabel>Shipping price (USD)</StudioFieldLabel>
          <TextInput
            style={studioStyles.fieldInput}
            keyboardType="decimal-pad"
            value={shippingUsd}
            onChangeText={setShippingUsd}
            placeholderTextColor={colors.textMuted}
          />
          <StudioFieldLabel>Handling time</StudioFieldLabel>
          <TextInput
            style={studioStyles.fieldInput}
            value={handlingTime}
            onChangeText={setHandlingTime}
            placeholderTextColor={colors.textMuted}
          />
          <StudioPrimaryButton
            label="Save shipping"
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
          />
        </StudioSection>

        <StudioSection title="Visibility">
          <View style={studioStyles.actionRow}>
            {status === 'active' || status === 'auction_live' ? (
              <StudioSecondaryButton
                label="Pause"
                onPress={() => {
                  Alert.alert('Pause listing?', 'This moves the listing to drafts.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Pause', onPress: () => void patchListing({ status: 'draft' }) },
                  ]);
                }}
              />
            ) : null}
            {status === 'draft' ? (
              <StudioPrimaryButton
                label="Publish"
                disabled={busy}
                onPress={() =>
                  void patchListing({
                    status: stored.buyingFormat === 'auction' ? 'auction_live' : 'active',
                  })
                }
              />
            ) : null}
            {status !== 'sold' && status !== 'draft' && status !== 'ended' ? (
              <StudioSecondaryButton
                label="Mark sold"
                onPress={() => {
                  Alert.alert('Mark as sold?', 'This will mark the listing as sold.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Mark sold', onPress: () => void patchListing({ status: 'sold' }) },
                  ]);
                }}
              />
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
        </StudioSection>

        <StudioSection title="Archive">
          <Text style={studioStyles.hint}>Permanently remove this listing from your inventory.</Text>
          <Pressable
            style={[studioStyles.dangerBtn, busy && studioStyles.btnOff]}
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
            <Text style={studioStyles.dangerBtnTxt}>Delete listing</Text>
          </Pressable>
        </StudioSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingTxt: { ...typography.body, color: colors.textSecondary },
  errorTitle: { ...typography.title, color: colors.textPrimary },
  backBtn: { padding: spacing.md },
  backBtnTxt: { color: colors.gold, fontWeight: '700' },
  thumbEmpty: { backgroundColor: colors.surface },
  offerCard: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  offerCardFocus: {
    backgroundColor: 'rgba(212,175,55,0.08)',
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
    borderBottomWidth: 0,
  },
  offerAmount: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  offerMessage: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontStyle: 'italic' },
  offerStatus: { color: colors.textMuted, fontSize: 12, textTransform: 'capitalize' },
});
