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
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useScreenSafeInsets } from '../lib/screenSafeInsets';
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
import { PremiumVaultButton } from '../components/product/PremiumVaultButton';
import { ZoomableImage } from '../components/product/ZoomableImage';
import { HostRow } from '../components/ui/HostRow';
import { ReportButton } from '../components/trust/ReportSheet';
import { enrichListing } from '../data/productListingEnrichment';
import { MARKETPLACE_TEXT_PROPS, marketplaceFontSize } from '../lib/marketplaceUiScale';
import type { RootStackParamList } from '../navigation/types';
import { MarketplaceMakeOfferSheet } from '../components/marketplace/MarketplaceMakeOfferSheet';
import {
  ProductDetailConfidenceStrip,
  ProductDetailTrustVault,
} from '../components/marketplace/ProductDetailTrustVault';
import { buildProductTrustMetrics } from '../lib/marketplaceItemTrust';
import {
  consumePendingMarketplaceListingAction,
  openMarketplaceBuyNow,
  openMarketplaceLayaway,
  openMarketplaceMakeOffer,
  openMarketplaceTrade,
} from '../navigation/openMarketplaceCommerce';
import { alertGuestBuyRestricted } from '../navigation/guestExploreGuards';
import { openMessageSellerForListing } from '../navigation/openMessages';
import { openContactSupport, openDispute, openSellerShop } from '../navigation/openPlatform';
import { fetchSellerFollowStatus, toggleSellerFollow } from '../api/sellerFollowRepository';
import { shareListingNative } from '../lib/shareListingNative';
import { useAuth } from '../auth/AuthContext';
import type { Product } from '../types';
import { colors, radii, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductDetail'>;

function galleryHeight(windowWidth: number, windowHeight: number): number {
  const compact = windowWidth < 410 || windowHeight < 860;
  return Math.round(Math.min(compact ? 360 : 420, windowWidth * (compact ? 0.82 : 0.88)));
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={styles.sectionKicker} {...MARKETPLACE_TEXT_PROPS}>
      {children}
    </Text>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.specRow}>
      <Text style={styles.specLbl} {...MARKETPLACE_TEXT_PROPS}>
        {label}
      </Text>
      <Text style={styles.specVal} {...MARKETPLACE_TEXT_PROPS}>
        {value}
      </Text>
    </View>
  );
}

function SellerLevelBadge({ label }: { label: string }) {
  return (
    <View style={styles.levelBadge}>
      <Ionicons name="shield-outline" size={11} color={colors.gold} />
      <Text style={styles.levelBadgeTxt} numberOfLines={1} ellipsizeMode="tail" {...MARKETPLACE_TEXT_PROPS}>
        {label}
      </Text>
    </View>
  );
}

export function ProductDetailScreen({ navigation, route }: Props) {
  const insets = useScreenSafeInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const heroH = galleryHeight(winW, winH);
  const compact = winW < 410;
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
  }, [route.params.productId, session?.access_token, user?.id, detailReloadNonce, navigation]);

  const vm = useMemo(() => (product ? enrichListing(product) : null), [product]);
  const trustMetrics = useMemo(() => (product ? buildProductTrustMetrics(product) : null), [product]);
  const [slide, setSlide] = useState(0);
  const [sellerFollow, setSellerFollow] = useState(false);

  useEffect(() => {
    if (!product?.seller.id) return;
    void fetchSellerFollowStatus(product.seller.id, session?.access_token).then((st) => {
      setSellerFollow(Boolean(st?.following));
    });
  }, [product?.seller.id, session?.access_token]);

  const [zoomUri, setZoomUri] = useState<string | null>(null);
  const [offerSheetOpen, setOfferSheetOpen] = useState(false);
  const galleryRef = useRef<ScrollView>(null);

  const commerceOpts = useMemo(
    () => ({
      accessToken: session?.access_token,
      guestExploreMode,
    }),
    [guestExploreMode, session?.access_token],
  );

  const goTradeOffer = () => {
    if (!product) return;
    openMarketplaceTrade(rootNav, product, commerceOpts);
  };

  const [makeOfferBusy, setMakeOfferBusy] = useState(false);

  const goMakeOffer = async () => {
    if (!product || makeOfferBusy) return;
    setMakeOfferBusy(true);
    try {
      await openMarketplaceMakeOffer(navigation, () => setOfferSheetOpen(true), product, commerceOpts);
    } finally {
      setMakeOfferBusy(false);
    }
  };

  const [buyNowBusy, setBuyNowBusy] = useState(false);

  const goBuyNow = async () => {
    if (!product || buyNowBusy) return;
    setBuyNowBusy(true);
    try {
      await openMarketplaceBuyNow(navigation, product, commerceOpts);
    } finally {
      setBuyNowBusy(false);
    }
  };

  const goLayaway = () => {
    if (!product) return;
    void openMarketplaceLayaway(navigation, product, commerceOpts);
  };

  useEffect(() => {
    if (!product || !session?.access_token || guestExploreMode) return;
    const pending = consumePendingMarketplaceListingAction(product.id);
    if (!pending) return;
    if (pending === 'buy_now') void openMarketplaceBuyNow(navigation, product, commerceOpts);
    else if (pending === 'layaway') void openMarketplaceLayaway(navigation, product, commerceOpts);
    else if (pending === 'make_offer') {
      setMakeOfferBusy(true);
      void openMarketplaceMakeOffer(navigation, () => setOfferSheetOpen(true), product, commerceOpts).finally(
        () => setMakeOfferBusy(false),
      );
    } else if (pending === 'trade') openMarketplaceTrade(rootNav, product, commerceOpts);
  }, [commerceOpts, guestExploreMode, navigation, product, rootNav, session?.access_token]);

  const layawayAvailable = product?.allowLayaway === true;
  const listingStatus = product?.listingStatus ?? 'active';
  const commerceBlocked =
    listingStatus === 'sold' ||
    listingStatus === 'layaway_reserved' ||
    listingStatus === 'ended' ||
    listingStatus === 'awaiting_auction_payment';
  const commerceStatusLabel =
    listingStatus === 'sold'
      ? 'This item has sold.'
      : listingStatus === 'layaway_reserved'
        ? 'Reserved on layaway — not available for purchase.'
        : null;

  const shareListing = async () => {
    if (!product) return;
    await shareListingNative(product);
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

  const titleSize = marketplaceFontSize(compact ? 24 : 28, Math.min(1, winW / 430));
  const priceSize = marketplaceFontSize(compact ? 30 : 34, Math.min(1, winW / 430));

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 112 }]}
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
                style={{ width: winW, height: heroH }}
                onPress={() => setZoomUri(g.uri)}
              >
                <Image source={{ uri: g.uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                <LinearGradient
                  colors={['rgba(0,0,0,0.2)', 'transparent', 'rgba(0,0,0,0.65)']}
                  locations={[0, 0.5, 1]}
                  style={StyleSheet.absoluteFillObject}
                />
                {g.kind === 'video' ? (
                  <View style={styles.playFab}>
                    <Ionicons name="play" size={28} color={colors.background} />
                  </View>
                ) : (
                  <View style={styles.zoomHint}>
                    <Ionicons name="expand-outline" size={14} color={colors.textPrimary} />
                    <Text style={styles.zoomHintTxt} {...MARKETPLACE_TEXT_PROPS}>
                      Tap to zoom
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>

          <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable style={styles.floatingIcon} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.topTitle} {...MARKETPLACE_TEXT_PROPS}>
              Listing
            </Text>
            <Pressable style={styles.floatingIcon} onPress={() => void shareListing()} accessibilityLabel="Share listing">
              <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
            </Pressable>
          </View>

          {vm.gallery.length > 1 ? (
            <View style={styles.dots}>
              {vm.gallery.map((g, i) => (
                <View key={g.id} style={[styles.dot, i === slide && styles.dotOn]} />
              ))}
            </View>
          ) : null}

          {vm.gallery.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
              {vm.gallery.map((g, i) => (
                <Pressable key={`t-${g.id}`} onPress={() => scrollToSlide(i)} style={styles.thumbWrap}>
                  <Image
                    source={{ uri: g.uri }}
                    style={[styles.thumb, i === slide && styles.thumbOn]}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>

        <View style={styles.pad}>
          <Text style={styles.acqTag} {...MARKETPLACE_TEXT_PROPS}>
            {vm.content.acquisitionTag}
          </Text>

          <Text style={[styles.title, { fontSize: titleSize, lineHeight: titleSize + 6 }]} {...MARKETPLACE_TEXT_PROPS}>
            {product.title}
          </Text>

          <View style={styles.priceRow}>
            <Text style={[styles.buyPrice, { fontSize: priceSize }]} {...MARKETPLACE_TEXT_PROPS}>
              {vm.pricing.buyNow}
            </Text>
            {vm.showVaultVerifiedBadge ? (
              <View style={styles.vvPill}>
                <Ionicons name="shield-checkmark" size={14} color={colors.gold} />
                <Text style={styles.vvPillTxt} {...MARKETPLACE_TEXT_PROPS}>
                  Vault verified
                </Text>
              </View>
            ) : null}
          </View>

          {product.conditionGrade ? (
            <Text style={styles.conditionLead} {...MARKETPLACE_TEXT_PROPS}>
              {product.conditionGrade}
            </Text>
          ) : null}

          {trustMetrics ? <ProductDetailTrustVault metrics={trustMetrics} /> : null}

          {commerceStatusLabel ? (
            <View style={styles.reservedBanner}>
              <Text style={styles.reservedBannerTxt} {...MARKETPLACE_TEXT_PROPS}>
                {commerceStatusLabel}
              </Text>
            </View>
          ) : null}

          {!commerceBlocked ? (
            <>
              {product.tradeOnly ? (
                <View style={styles.inlineCtas}>
                  <PremiumVaultButton
                    variant="primary"
                    label="Start trade offer"
                    icon="swap-horizontal-outline"
                    onPress={goTradeOffer}
                    flex
                    compact={compact}
                  />
                </View>
              ) : (
                <>
                  <View style={styles.inlineCtas}>
                    <PremiumVaultButton
                      variant="primary"
                      label={`Buy now · ${vm.pricing.buyNow}`}
                      icon="bag-outline"
                      onPress={() => void goBuyNow()}
                      loading={buyNowBusy}
                      flex
                      compact={compact}
                    />
                  </View>

                  {(vm.trade.allowOffers || vm.trade.acceptsTrades) && (
                    <View style={styles.secondaryCtaRow}>
                      {vm.trade.allowOffers ? (
                        <PremiumVaultButton
                          variant="secondary"
                          label="Make offer"
                          icon="pricetag-outline"
                          onPress={() => void goMakeOffer()}
                          loading={makeOfferBusy}
                          flex
                          compact={compact}
                        />
                      ) : null}
                      {vm.trade.acceptsTrades ? (
                        <PremiumVaultButton
                          variant="secondary"
                          label="Trade offer"
                          icon="swap-horizontal-outline"
                          onPress={goTradeOffer}
                          flex
                          compact={compact}
                        />
                      ) : null}
                    </View>
                  )}
                </>
              )}

              {layawayAvailable ? (
                <Pressable style={styles.layawayCta} onPress={goLayaway}>
                  <Text style={styles.layawayCtaTxt} {...MARKETPLACE_TEXT_PROPS}>
                    Layaway available — 25% deposit
                  </Text>
                </Pressable>
              ) : null}

              <ProductDetailConfidenceStrip />
            </>
          ) : null}

          {vm.content.description ? (
            <>
              <SectionTitle>Description</SectionTitle>
              <View style={styles.proseCard}>
                <Text style={styles.prose} {...MARKETPLACE_TEXT_PROPS}>
                  {vm.content.description}
                </Text>
              </View>
            </>
          ) : null}

          <SectionTitle>Details</SectionTitle>
          <View style={styles.specCard}>
            {vm.specs.map((s) => (
              <SpecRow key={s.label} label={s.label} value={s.value} />
            ))}
          </View>

          {vm.content.shippingProtection ? (
            <>
              <SectionTitle>Shipping & returns</SectionTitle>
              <View style={styles.proseCard}>
                <Text style={styles.prose} {...MARKETPLACE_TEXT_PROPS}>
                  {vm.content.shippingProtection}
                </Text>
                {vm.content.authDetails ? (
                  <Text style={[styles.prose, styles.proseMuted]} {...MARKETPLACE_TEXT_PROPS}>
                    {vm.content.authDetails}
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}

          <SectionTitle>Seller spotlight</SectionTitle>
          <View style={styles.showroomCard}>
            <Pressable onPress={() => openSellerShop(product.seller.id, rootNav)}>
              <HostRow
                host={product.seller}
                following={sellerFollow}
                onFollowPress={() => {
                  if (!user?.id || !session?.access_token) {
                    alertGuestBuyRestricted();
                    return;
                  }
                  const prev = sellerFollow;
                  setSellerFollow(!prev);
                  void toggleSellerFollow(product.seller.id, prev, session.access_token).then(
                    ({ following, error }) => {
                      if (error) {
                        setSellerFollow(prev);
                        Alert.alert('Follow', error);
                        return;
                      }
                      setSellerFollow(following);
                    },
                  );
                }}
              />
            </Pressable>
            {vm.sellerLevelBadge ? <SellerLevelBadge label={vm.sellerLevelBadge} /> : null}
            <View style={styles.sellerActions}>
              <PremiumVaultButton
                variant="secondary"
                label="View shop"
                icon="storefront-outline"
                onPress={() => openSellerShop(product.seller.id, rootNav)}
                flex
                compact={compact}
              />
              <PremiumVaultButton
                variant="secondary"
                label="Message seller"
                icon="chatbubble-ellipses-outline"
                onPress={() => {
                  if (guestExploreMode) {
                    alertGuestBuyRestricted();
                    return;
                  }
                  openMessageSellerForListing(rootNav, { listingId: product.id });
                }}
                flex
                compact={compact}
              />
            </View>
            {!isOwner ? (
              <View style={styles.reportRow}>
                <ReportButton
                  targetType="listing"
                  targetId={product.id}
                  accessToken={session?.access_token}
                  label="Report"
                />
              </View>
            ) : null}
          </View>

          {vm.liveAppearances.length > 0 ? (
            <>
              <SectionTitle>Live appearances</SectionTitle>
              <View style={styles.liveAppearancesCard}>
                {vm.liveAppearances.map((appearance) => (
                  <View key={appearance.id} style={styles.liveAppearanceRow}>
                    <Ionicons name="radio-outline" size={16} color={colors.gold} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.liveAppearanceTitle} numberOfLines={1} ellipsizeMode="tail" {...MARKETPLACE_TEXT_PROPS}>
                        {appearance.title}
                      </Text>
                      {appearance.subtitle ? (
                        <Text style={styles.liveAppearanceSub} numberOfLines={2} ellipsizeMode="tail" {...MARKETPLACE_TEXT_PROPS}>
                          {appearance.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    {appearance.occurredAtLabel ? (
                      <Text style={styles.liveAppearanceWhen} {...MARKETPLACE_TEXT_PROPS}>
                        {appearance.occurredAtLabel}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}

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

          {recents.length ? (
            <>
              <View style={styles.sectionHeadRow}>
                <SectionTitle>More from this seller</SectionTitle>
                <Pressable onPress={() => openSellerShop(product.seller.id, rootNav)} hitSlop={8}>
                  <Text style={styles.sectionHeadLink} {...MARKETPLACE_TEXT_PROPS}>
                    View shop
                  </Text>
                </Pressable>
              </View>
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
                    <Text style={styles.miniTitle} numberOfLines={2} {...MARKETPLACE_TEXT_PROPS}>
                      {p.title}
                    </Text>
                    <Text style={styles.miniPrice} {...MARKETPLACE_TEXT_PROPS}>
                      {p.listingPrice}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          {similar.length ? (
            <>
              <SectionTitle>Similar listings</SectionTitle>
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
                    <Text style={styles.miniTitle} numberOfLines={2} {...MARKETPLACE_TEXT_PROPS}>
                      {p.title}
                    </Text>
                    <Text style={styles.miniPrice} {...MARKETPLACE_TEXT_PROPS}>
                      {p.listingPrice}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          <View style={styles.supportRow}>
            <Pressable onPress={() => openContactSupport({ category: 'order', referenceId: product.id }, rootNav)}>
              <Text style={styles.supportLink} {...MARKETPLACE_TEXT_PROPS}>
                Contact support
              </Text>
            </Pressable>
            <Text style={styles.supportDot}>·</Text>
            <Pressable onPress={() => openDispute({ contextType: 'marketplace', referenceId: product.id }, rootNav)}>
              <Text style={styles.supportLink} {...MARKETPLACE_TEXT_PROPS}>
                Open dispute
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
        <LinearGradient
          colors={['transparent', 'rgba(5,5,5,0.92)']}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={[styles.stickyInner, compact && styles.stickyInnerCompact]}>
          <View style={styles.stickyCopy}>
            <Text style={styles.stickyTitle} numberOfLines={1} {...MARKETPLACE_TEXT_PROPS}>
              {product.title}
            </Text>
            <Text style={styles.stickyPrice} {...MARKETPLACE_TEXT_PROPS}>
              {vm.pricing.buyNow}
            </Text>
          </View>
          {!commerceBlocked ? (
            <PremiumVaultButton
              variant="primary"
              label={product.tradeOnly ? 'Trade offer' : 'Buy now'}
              icon={product.tradeOnly ? 'swap-horizontal-outline' : 'bag-outline'}
              onPress={product.tradeOnly ? goTradeOffer : () => void goBuyNow()}
              loading={product.tradeOnly ? false : buyNowBusy}
              compact={compact}
            />
          ) : null}
        </View>
      </View>

      <Modal visible={!!zoomUri} transparent animationType="fade" onRequestClose={() => setZoomUri(null)}>
        <View style={styles.zoomModal}>
          <Pressable style={styles.zoomClose} onPress={() => setZoomUri(null)}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </Pressable>
          {zoomUri ? <ZoomableImage key={zoomUri} uri={zoomUri} style={styles.zoomImg} /> : null}
        </View>
      </Modal>

      {product && session?.access_token ? (
        <MarketplaceMakeOfferSheet
          visible={offerSheetOpen}
          onClose={() => setOfferSheetOpen(false)}
          listingId={product.id}
          listingTitle={product.title}
          askingPrice={product.listingPrice}
          accessToken={session.access_token}
          onSuccess={() => setOfferSheetOpen(false)}
        />
      ) : null}
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
    marginBottom: spacing.md,
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
    bottom: 64,
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
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    opacity: 0.75,
  },
  thumbOn: {
    borderColor: colors.gold,
    opacity: 1,
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
    top: 88,
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
  pad: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  acqTag: {
    ...typography.micro,
    color: colors.gold,
    letterSpacing: 1.2,
  },
  title: {
    ...typography.hero,
    color: colors.textPrimary,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: -spacing.xs,
  },
  buyPrice: {
    color: colors.gold,
    fontWeight: '900',
    letterSpacing: -1,
  },
  vvPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  vvPillTxt: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  conditionLead: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    marginTop: -spacing.xs,
  },
  inlineCtas: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  secondaryCtaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priceCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: spacing.xs,
  },
  marketRef: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  delivery: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  protectedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  protectedTxt: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  payNote: { color: colors.textMuted, fontSize: 12 },
  reservedBanner: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  reservedBannerTxt: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  layawayCta: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: 'rgba(212,175,55,0.1)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  layawayCtaTxt: { color: colors.gold, fontWeight: '700', fontSize: 13 },
  sectionKicker: {
    ...typography.micro,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: spacing.sm,
    marginBottom: -spacing.xs,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionHeadLink: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  proseCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  prose: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
  },
  proseMuted: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
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
  levelBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
    maxWidth: '100%',
  },
  levelBadgeTxt: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sellerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  reportRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  liveAppearancesCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(212,175,55,0.04)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  liveAppearanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  liveAppearanceTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  liveAppearanceSub: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  liveAppearanceWhen: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  miniRail: { gap: spacing.md, paddingVertical: spacing.xs },
  miniCard: { width: 140 },
  miniImg: { width: 140, height: 104, borderRadius: radii.md, backgroundColor: colors.surfaceElevated },
  miniTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', marginTop: spacing.sm },
  miniPrice: { color: colors.gold, fontSize: 14, fontWeight: '800', marginTop: 4 },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  supportLink: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  supportDot: {
    color: colors.textMuted,
    fontSize: 12,
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
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  stickyInnerCompact: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  stickyCopy: {
    flex: 1,
    minWidth: 0,
  },
  stickyTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  stickyPrice: {
    color: colors.gold,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
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
