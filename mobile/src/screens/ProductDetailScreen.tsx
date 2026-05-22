import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchListingsBySeller,
  fetchMarketplaceListingByIdWithRetry,
  fetchMarketplaceListings,
} from '../api/listingsFeedRepository';
import { mapStoredListingToProduct } from '../api/mapStoredListingToProduct';
import { mapWebMarketplaceListingToProduct } from '../api/mapWebMarketplaceListing';
import type { WebListingEndRequest } from '../api/listingEndRepository';
import { fetchListingDetailFromWeb, type WebStoredListing } from '../api/webListingsRepository';
import { SellerListingEndControls } from '../components/seller/SellerListingEndControls';
import { PremiumEmptyPanel } from '../components/empty/PremiumEmptyPanel';
import { HostRow } from '../components/ui/HostRow';
import { enrichListing } from '../data/productListingEnrichment';
import type { RootStackParamList } from '../navigation/types';
import { alertGuestBuyRestricted } from '../navigation/guestExploreGuards';
import { openMessageSellerForListing } from '../navigation/openMessages';
import { openContactSupport, openDispute, openUserProfile } from '../navigation/openPlatform';
import { isFollowing, toggleFollow } from '../platform/platformStore';
import { useAuth } from '../auth/AuthContext';
import type { Product } from '../types';
import { colors, radii, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductDetail'>;

const GALLERY_HEIGHT = 460;

function ActivityChip({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={14} color={colors.gold} />
      <Text style={styles.chipTxt} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.specRow}>
      <Text style={styles.specLbl}>{label}</Text>
      <Text style={styles.specVal}>{value}</Text>
    </View>
  );
}

export function ProductDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { guestExploreMode, user, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [similarFromApi, setSimilarFromApi] = useState<Product[]>([]);
  const [sellerFromApi, setSellerFromApi] = useState<Product[]>([]);
  const [ownerStored, setOwnerStored] = useState<WebStoredListing | null>(null);
  const [endRequest, setEndRequest] = useState<WebListingEndRequest | null>(null);
  const [ownerBidCount, setOwnerBidCount] = useState(0);
  const [detailReloadNonce, setDetailReloadNonce] = useState(0);

  const isOwner = Boolean(ownerStored && user?.id && ownerStored.sellerId === user.id);

  useEffect(() => {
    const listingId = route.params.productId;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const token = session?.access_token;
      const detail = token ? await fetchListingDetailFromWeb(listingId, token) : null;

      let remote =
        detail?.marketplace != null ? mapWebMarketplaceListingToProduct(detail.marketplace) : null;

      if (!remote && detail?.stored) {
        remote = mapStoredListingToProduct(detail.stored);
      }
      if (!remote) {
        remote = await fetchMarketplaceListingByIdWithRetry(listingId);
      }

      if (cancelled) return;
      if (!remote) {
        setProduct(null);
        setOwnerStored(null);
        setEndRequest(null);
        setSimilarFromApi([]);
        setSellerFromApi([]);
        setLoading(false);
        return;
      }

      if (detail?.stored && user?.id === detail.stored.sellerId) {
        if (!cancelled) {
          navigation.replace('SellerListingManagement', { listingId });
        }
        return;
      } else {
        setOwnerStored(null);
        setEndRequest(null);
        setOwnerBidCount(0);
      }

      const [bySeller, byCategory] = await Promise.all([
        fetchListingsBySeller({ sellerId: remote.seller.id, excludeListingId: remote.id, limit: 10 }),
        fetchMarketplaceListings({ category: remote.category, limit: 12 }),
      ]);
      if (cancelled) return;
      setProduct(remote);
      setSellerFromApi(bySeller);
      setSimilarFromApi(byCategory.filter((x) => x.id !== remote.id));
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [route.params.productId, session?.access_token, user?.id, detailReloadNonce]);

  const vm = useMemo(() => (product ? enrichListing(product) : null), [product]);
  const [slide, setSlide] = useState(0);
  const [saved, setSaved] = useState(false);
  const [sellerFollow, setSellerFollow] = useState(false);
  useEffect(() => {
    if (!user?.id || !product?.seller.id) return;
    void isFollowing(user.id, product.seller.id).then(setSellerFollow);
  }, [user?.id, product?.seller.id]);
  const [zoomUri, setZoomUri] = useState<string | null>(null);
  const galleryRef = useRef<ScrollView>(null);

  const goTradeOffer = () => {
    if (guestExploreMode) {
      alertGuestBuyRestricted();
      return;
    }
    if (!product) return;
    rootNav.navigate('MainTabs', {
      screen: 'TradeCenter',
      params: {
        screen: 'InitiateTrade',
        params: { requestedListingId: product.id },
      },
    });
  };

  const shareListing = async () => {
    if (!product) return;
    try {
      await Share.share({
        title: product.title,
        message: `${product.title} — ${product.listingPrice} on Get Vaulted`,
      });
    } catch {
      /* user cancelled */
    }
  };

  const onGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    setSlide(Math.round(x / winW));
  };

  const scrollToSlide = (i: number) => {
    galleryRef.current?.scrollTo({ x: i * winW, animated: true });
    setSlide(i);
  };

  const similar = useMemo(() => {
    if (!vm || !product) return [];
    return similarFromApi;
  }, [vm, product, similarFromApi]);

  const recents = useMemo(() => {
    if (!vm || !product) return [];
    return sellerFromApi;
  }, [vm, product, sellerFromApi]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={styles.loadingHint}>Loading listing…</Text>
      </View>
    );
  }

  if (!product || !vm) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg }]}>
        <Pressable style={styles.floatingIcon} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <PremiumEmptyPanel
          icon="cube-outline"
          title="Listing not found"
          subtitle="This item may have sold, been delisted, or the link is out of date. Browse the Marketplace for vault inventory."
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
      >
        <View style={styles.heroShell}>
          <ScrollView
            ref={galleryRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onGalleryScroll}
            scrollEventThrottle={16}
            decelerationRate="fast"
            snapToInterval={winW}
            snapToAlignment="center"
          >
            {vm.gallery.map((g) => (
              <Pressable
                key={g.id}
                style={{ width: winW, height: GALLERY_HEIGHT }}
                onPress={() => {
                  setZoomUri(g.uri);
                }}
              >
                <Image source={{ uri: g.uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                <LinearGradient
                  colors={['rgba(0,0,0,0.15)', 'transparent', 'rgba(0,0,0,0.75)']}
                  locations={[0, 0.45, 1]}
                  style={StyleSheet.absoluteFillObject}
                />
                {g.kind === 'video' ? (
                  <View style={styles.playFab}>
                    <Ionicons name="play" size={28} color={colors.background} />
                  </View>
                ) : (
                  <View style={styles.zoomHint}>
                    <Ionicons name="expand-outline" size={14} color={colors.textPrimary} />
                    <Text style={styles.zoomHintTxt}>Tap to zoom</Text>
                  </View>
                )}
                <View style={styles.captionBand}>
                  <Text style={styles.captionBandTxt}>{g.caption}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>

          <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable style={styles.floatingIcon} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.topTitle}>Acquisition</Text>
            <Pressable style={styles.floatingIcon} onPress={() => void shareListing()} accessibilityLabel="Share listing">
              <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.dots}>
            {vm.gallery.map((g, i) => (
              <View key={g.id} style={[styles.dot, i === slide && styles.dotOn]} />
            ))}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbRow}
          >
            {vm.gallery.map((g, i) => (
              <Pressable key={`t-${g.id}`} onPress={() => scrollToSlide(i)} style={styles.thumbWrap}>
                <Image
                  source={{ uri: g.uri }}
                  style={[styles.thumb, i === slide && styles.thumbOn]}
                  resizeMode="cover"
                />
                {g.kind === 'video' ? (
                  <View style={styles.thumbPlay}>
                    <Ionicons name="videocam" size={12} color={colors.gold} />
                  </View>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.pad}>
          <Text style={styles.acqTag}>{vm.content.acquisitionTag}</Text>
          <Text style={styles.title}>{product.title}</Text>
          {product.conditionGrade ? (
            <Text style={styles.conditionLead}>{product.conditionGrade}</Text>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            <ActivityChip icon="eye-outline" label={`${vm.activity.watching} watching`} />
            <ActivityChip icon="pricetags-outline" label={`${vm.activity.offersPending} offers pending`} />
            <ActivityChip icon="bookmark-outline" label={`${vm.activity.vaultSaves} vault saves`} />
            <ActivityChip icon="flame-outline" label={vm.activity.recentlyViewedLabel} />
            {vm.activity.priceUpdatedLabel ? (
              <ActivityChip icon="trending-up-outline" label={vm.activity.priceUpdatedLabel} />
            ) : null}
            {vm.activity.featuredInLive ? (
              <ActivityChip icon="radio-outline" label={vm.activity.featuredInLive} />
            ) : null}
            {vm.activity.sellerLive ? (
              <ActivityChip icon="pulse" label="Seller live now" />
            ) : null}
          </ScrollView>

          <View style={styles.trustCard}>
            {product.vaultVerified ? (
              <View style={styles.vvRow}>
                <Ionicons name="shield-checkmark" size={20} color={colors.gold} />
                <Text style={styles.vvStrong}>Vaulted Verified</Text>
              </View>
            ) : null}
            <Text style={styles.trustLine}>{vm.inspectionLine}</Text>
            <Text style={styles.trustSub}>{vm.authProvider}</Text>
            <View style={styles.trustGrid}>
              <Text style={styles.trustStat}>{vm.sellerShowroom.ratingLabel}</Text>
              <Text style={styles.trustStat}>{vm.sellerShowroom.salesCount}</Text>
              <Text style={styles.trustStat}>{vm.sellerShowroom.tradesCount}</Text>
              <Text style={styles.trustStat}>{vm.sellerShowroom.completionRate}</Text>
              <Text style={styles.trustStat}>{vm.sellerShowroom.shippingSpeed}</Text>
              <Text style={styles.trustStat}>{vm.sellerShowroom.responseTime}</Text>
            </View>
            {vm.sellerShowroom.provenance ? (
              <Text style={styles.prov}>{vm.sellerShowroom.provenance}</Text>
            ) : null}
          </View>

          <View style={styles.tradeCard}>
            <Text style={styles.sectionKicker}>Trade intelligence</Text>
            <View style={styles.tradeRow}>
              <View style={styles.tradePill}>
                <Text style={styles.tradePillTxt}>{vm.trade.acceptsTrades ? 'Accepts trades' : 'Trades off'}</Text>
              </View>
              <View style={styles.tradePill}>
                <Text style={styles.tradePillTxt}>{vm.trade.tradeEligible ? 'Trade eligible' : 'Buy only'}</Text>
              </View>
            </View>
            <Text style={styles.lookingLbl}>Looking for</Text>
            {vm.trade.lookingFor.map((t) => (
              <Text key={t} style={styles.lookingItem}>
                · {t}
              </Text>
            ))}
            <View style={styles.tradeCtas}>
              <Pressable style={styles.outlineCta} onPress={() => setSaved(true)}>
                <Ionicons name="eye-outline" size={18} color={colors.gold} />
                <Text style={styles.outlineCtaTxt}>Watch</Text>
              </Pressable>
              <Pressable style={styles.outlineCta} onPress={goTradeOffer}>
                <Ionicons name="swap-horizontal-outline" size={18} color={colors.gold} />
                <Text style={styles.outlineCtaTxt}>Trade offer</Text>
              </Pressable>
            </View>
          </View>

          <LinearGradient
            colors={['rgba(212,175,55,0.08)', 'rgba(10,10,10,0.95)']}
            style={styles.priceCard}
          >
            <Text style={styles.buyLabel}>Buy now</Text>
            <Text style={styles.buyPrice}>{vm.pricing.buyNow}</Text>
            {vm.pricing.marketReference ? (
              <Text style={styles.marketRef}>{vm.pricing.marketReference}</Text>
            ) : null}
            <Text style={styles.delivery}>{vm.pricing.deliveryEstimate}</Text>
            <View style={styles.protectedRow}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.gold} />
              <Text style={styles.protectedTxt}>Vaulted Protected Checkout</Text>
            </View>
            <Text style={styles.payNote}>{vm.pricing.paymentNote}</Text>
            <Text style={styles.feeNote}>{vm.pricing.feeTransparency}</Text>
          </LinearGradient>

          {isOwner && ownerStored ? (
            <SellerListingEndControls
              listingId={ownerStored.id}
              title={ownerStored.title}
              buyingFormat={ownerStored.buyingFormat ?? 'buy_now'}
              listingStatus={ownerStored.status ?? 'active'}
              bidCount={ownerBidCount}
              endRequest={endRequest}
              onChanged={() => setDetailReloadNonce((n) => n + 1)}
            />
          ) : null}

          <Text style={styles.sectionKicker}>Collector signals</Text>
          <Text style={styles.signal}>
            Momentum updates as collectors watch, save, and message — category heat appears once live data is available.
          </Text>

          <Text style={styles.sectionKicker}>Specifications</Text>
          <View style={styles.specCard}>
            {vm.specs.map((s) => (
              <SpecRow key={s.label} label={s.label} value={s.value} />
            ))}
          </View>

          <Text style={styles.sectionKicker}>Seller showroom</Text>
          <View style={styles.showroomCard}>
            <Pressable onPress={() => openUserProfile(product.seller.id, rootNav)}>
              <HostRow
                host={product.seller}
                following={sellerFollow}
                onFollowPress={() => {
                  if (!user?.id) {
                    alertGuestBuyRestricted();
                    return;
                  }
                  void toggleFollow(user.id, product.seller.id).then(setSellerFollow);
                }}
              />
            </Pressable>
            {vm.activity.sellerLive ? (
              <View style={styles.liveNow}>
                <View style={styles.liveDot} />
                <Text style={styles.liveNowTxt}>Seller is live — vault lane open</Text>
              </View>
            ) : null}
            <Text style={styles.showLine}>
              <Text style={styles.showEm}>Specialties: </Text>
              {vm.sellerShowroom.specialties.join(' · ')}
            </Text>
            <Text style={styles.showLine}>
              <Text style={styles.showEm}>Top categories: </Text>
              {vm.sellerShowroom.topCategories.join(' · ')}
            </Text>
            <Text style={styles.showLine}>
              <Text style={styles.showEm}>Live schedule: </Text>
              {vm.sellerShowroom.liveSchedule}
            </Text>
            <Text style={styles.showLine}>
              <Text style={styles.showEm}>Vault score: </Text>
              {vm.sellerShowroom.vaultScore}
            </Text>
            <View style={styles.sellerActions}>
              <Pressable
                style={styles.messageCta}
                onPress={() => {
                  if (guestExploreMode) {
                    alertGuestBuyRestricted();
                    return;
                  }
                  openMessageSellerForListing(rootNav, { listingId: product.id });
                }}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.gold} />
                <Text style={styles.messageCtaTxt}>Message seller</Text>
              </Pressable>
              <Pressable
                style={styles.liveCta}
                onPress={() =>
                  navigation.navigate('MainTabs', { screen: 'Live', params: { screen: 'LiveDiscovery' } })
                }
              >
                <Ionicons name="radio-outline" size={18} color={colors.gold} />
                <Text style={styles.liveCtaTxt}>Join show</Text>
              </Pressable>
            </View>
            <View style={styles.sellerActions}>
              <Pressable
                style={styles.messageCta}
                onPress={() => openContactSupport({ category: 'order', referenceId: product.id }, rootNav)}
              >
                <Text style={styles.messageCtaTxt}>Contact support</Text>
              </Pressable>
              <Pressable
                style={styles.liveCta}
                onPress={() => openDispute({ contextType: 'marketplace', referenceId: product.id }, rootNav)}
              >
                <Text style={[styles.liveCtaTxt, { color: colors.live }]}>Open dispute</Text>
              </Pressable>
            </View>
          </View>

          {recents.length ? (
            <>
              <Text style={styles.sectionKicker}>Recent listings · same seller</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.miniRail}>
                {recents.map((p) => (
                  <Pressable
                    key={p.id}
                    style={styles.miniCard}
                    onPress={() => navigation.replace('ProductDetail', { productId: p.id })}
                  >
                    {p.imageUrl ? (
                      <Image source={{ uri: p.imageUrl }} style={styles.miniImg} resizeMode="cover" />
                    ) : (
                      <View style={[styles.miniImg, { backgroundColor: colors.surfaceElevated }]} />
                    )}
                    <Text style={styles.miniTitle} numberOfLines={2}>
                      {p.title}
                    </Text>
                    <Text style={styles.miniPrice}>{p.listingPrice}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          <Text style={styles.sectionKicker}>Seller notes</Text>
          <Text style={styles.prose}>{vm.content.sellerNotes}</Text>

          <Text style={styles.sectionKicker}>Condition notes</Text>
          <Text style={styles.prose}>{vm.content.conditionNotes}</Text>

          <Text style={styles.sectionKicker}>Authentication details</Text>
          <Text style={styles.prose}>{vm.content.authDetails}</Text>

          <Text style={styles.sectionKicker}>Shipping & protection</Text>
          <Text style={styles.prose}>{vm.content.shippingProtection}</Text>

          <Text style={styles.sectionKicker}>Collector interest</Text>
          <Text style={styles.prose}>{vm.content.collectorInterest}</Text>

          <View style={styles.featuredLive}>
            <LinearGradient colors={['#1a1408', '#080806']} style={StyleSheet.absoluteFillObject} />
            <Text style={styles.flTitle}>{vm.content.featuredLiveTitle}</Text>
            <Text style={styles.flSub}>{vm.content.featuredLiveSubtitle}</Text>
            <Pressable
              style={styles.flBtn}
              onPress={() =>
                navigation.navigate('MainTabs', { screen: 'Live', params: { screen: 'LiveDiscovery' } })
              }
            >
              <Text style={styles.flBtnTxt}>Open live hub</Text>
            </Pressable>
          </View>

          {similar.length ? (
            <>
              <Text style={styles.sectionKicker}>Similar listings</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.miniRail}>
                {similar.map((p) => (
                  <Pressable
                    key={p.id}
                    style={styles.miniCard}
                    onPress={() => navigation.replace('ProductDetail', { productId: p.id })}
                  >
                    {p.imageUrl ? (
                      <Image source={{ uri: p.imageUrl }} style={styles.miniImg} resizeMode="cover" />
                    ) : null}
                    <Text style={styles.miniTitle} numberOfLines={2}>
                      {p.title}
                    </Text>
                    <Text style={styles.miniPrice}>{p.listingPrice}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              <Text style={styles.sectionKicker}>Similar listings</Text>
              <Text style={styles.prose}>More inventory in this category will appear as sellers publish new listings.</Text>
            </>
          )}

          {vm.recentlySold.length ? (
            <>
              <Text style={styles.sectionKicker}>Recently sold</Text>
              <View style={styles.soldCard}>
                {vm.recentlySold.map((s) => (
                  <View key={s.title} style={styles.soldRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.soldTitle}>{s.title}</Text>
                      <Text style={styles.soldWhen}>{s.when}</Text>
                    </View>
                    <Text style={styles.soldPrice}>{s.price}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.closingLine}>You are not buying inventory — you are acquiring something important.</Text>
        </View>
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.stickyInner}>
          <Pressable style={styles.saveBtn} onPress={() => setSaved((s) => !s)}>
            <Ionicons name={saved ? 'heart' : 'heart-outline'} size={22} color={saved ? colors.live : colors.textPrimary} />
          </Pressable>
          <Pressable
            style={styles.stickyOffer}
            onPress={() => (guestExploreMode ? alertGuestBuyRestricted() : goTradeOffer())}
          >
            <Text style={styles.stickyOfferTxt}>Offer</Text>
          </Pressable>
          <Pressable style={styles.stickyTrade} onPress={goTradeOffer}>
            <Text style={styles.stickyTradeTxt}>Trade</Text>
          </Pressable>
          <Pressable
            style={styles.stickyBuy}
            onPress={() => (guestExploreMode ? alertGuestBuyRestricted() : goTradeOffer())}
          >
            <Text style={styles.stickyBuyTop}>Buy now</Text>
            <Text style={styles.stickyBuyPrice}>{vm.pricing.buyNow}</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={!!zoomUri} transparent animationType="fade" onRequestClose={() => setZoomUri(null)}>
        <View style={styles.zoomModal}>
          <Pressable style={styles.zoomClose} onPress={() => setZoomUri(null)}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </Pressable>
          {zoomUri ? (
            <Image source={{ uri: zoomUri }} style={styles.zoomImg} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingHint: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
  },
  heroShell: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  floatingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  topTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  dots: {
    position: 'absolute',
    bottom: 72,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    zIndex: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotOn: {
    backgroundColor: colors.gold,
    width: 18,
  },
  thumbRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    opacity: 0.75,
  },
  thumbOn: {
    borderColor: colors.gold,
    opacity: 1,
  },
  thumbPlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    padding: 2,
  },
  playFab: {
    position: 'absolute',
    top: '42%',
    left: '50%',
    marginLeft: -32,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(244,241,234,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomHint: {
    position: 'absolute',
    top: 100,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  zoomHintTxt: { color: colors.textPrimary, fontSize: 11, fontWeight: '700' },
  captionBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 56,
    paddingHorizontal: spacing.lg,
  },
  captionBandTxt: {
    color: 'rgba(244,241,234,0.9)',
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  pad: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  acqTag: {
    ...typography.micro,
    color: colors.gold,
    letterSpacing: 1.2,
  },
  title: {
    ...typography.hero,
    color: colors.textPrimary,
    fontSize: 30,
    lineHeight: 36,
  },
  conditionLead: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    marginTop: -spacing.sm,
  },
  chipScroll: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    maxWidth: 220,
  },
  chipTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  trustCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  vvRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  vvStrong: { color: colors.gold, fontSize: 16, fontWeight: '800' },
  trustLine: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  trustSub: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  trustGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  trustStat: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  prov: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: spacing.xs },
  tradeCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(212,175,55,0.04)',
    gap: spacing.sm,
  },
  sectionKicker: {
    ...typography.micro,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: -spacing.sm,
  },
  tradeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  tradePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  tradePillTxt: { color: colors.gold, fontSize: 12, fontWeight: '800' },
  lookingLbl: { color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.sm },
  lookingItem: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  tradeCtas: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  outlineCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  outlineCtaTxt: { color: colors.textPrimary, fontWeight: '800', fontSize: 14 },
  priceCard: {
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: spacing.sm,
  },
  buyLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  buyPrice: { color: colors.gold, fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  marketRef: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  delivery: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginTop: spacing.sm },
  protectedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  protectedTxt: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  payNote: { color: colors.textMuted, fontSize: 12 },
  feeNote: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  signal: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  specCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  specRow: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  specLbl: { width: 110, color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  specVal: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  showroomCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  liveNow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.xs },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  liveNowTxt: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  showLine: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  showEm: { color: colors.textPrimary, fontWeight: '800' },
  sellerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  messageCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  messageCtaTxt: { color: colors.gold, fontWeight: '800', fontSize: 14 },
  liveCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.goldSoft,
  },
  liveCtaTxt: { color: colors.textPrimary, fontWeight: '800', fontSize: 14 },
  miniRail: { gap: spacing.md, paddingVertical: spacing.xs },
  miniCard: { width: 148 },
  miniImg: { width: 148, height: 110, borderRadius: radii.md, backgroundColor: colors.surfaceElevated },
  miniTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', marginTop: spacing.sm },
  miniPrice: { color: colors.gold, fontSize: 14, fontWeight: '800', marginTop: 4 },
  prose: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
  },
  featuredLive: {
    padding: spacing.xl,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: spacing.sm,
  },
  flTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  flSub: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  flBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
  },
  flBtnTxt: { color: colors.background, fontWeight: '800', fontSize: 14 },
  soldCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    gap: spacing.md,
  },
  soldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  soldTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  soldWhen: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  soldPrice: { color: colors.gold, fontWeight: '800', fontSize: 16 },
  closingLine: {
    color: colors.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 22,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    overflow: 'hidden',
  },
  stickyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  saveBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  stickyOffer: {
    paddingHorizontal: 14,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  stickyOfferTxt: { color: colors.textPrimary, fontWeight: '800', fontSize: 13 },
  stickyTrade: {
    paddingHorizontal: 14,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  stickyTradeTxt: { color: colors.gold, fontWeight: '800', fontSize: 13 },
  stickyBuy: {
    flex: 1,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  stickyBuyTop: { color: colors.background, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  stickyBuyPrice: { color: colors.background, fontSize: 16, fontWeight: '900' },
  zoomModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    justifyContent: 'center',
  },
  zoomClose: {
    position: 'absolute',
    top: 48,
    right: spacing.lg,
    zIndex: 2,
    padding: spacing.sm,
  },
  zoomImg: {
    flex: 1,
    width: '100%',
  },
});
