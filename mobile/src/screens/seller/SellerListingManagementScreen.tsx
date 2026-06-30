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
import { publicListingPath } from '../../lib/sellerListingRoutes';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';

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
});
