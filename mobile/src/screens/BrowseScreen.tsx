import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMarketplaceListings } from '../api/listingsFeedRepository';
import { PremiumEmptyPanel } from '../components/empty/PremiumEmptyPanel';
import { ProductCard } from '../components/ui/ProductCard';
import { SearchBar } from '../components/ui/SearchBar';
import { SectionHeader } from '../components/ui/SectionHeader';
import { ShimmerRail } from '../components/ui/ShimmerRail';
import { categoryMeta } from '../data/categoryTaxonomy';
import { isSupabaseConfigured } from '../lib/supabase';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, radii, spacing, typography } from '../theme';
import type { CategoryId, Product } from '../types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

/** Hobby-first category order — aligns with real inventory lanes. */
const categories: CategoryId[] = ['cards', 'memorabilia', 'sneakers', 'watches', 'luxury', 'other'];

function categoryChipIcon(c: CategoryId): keyof typeof Ionicons.glyphMap {
  switch (c) {
    case 'watches':
      return 'time-outline';
    case 'sneakers':
      return 'footsteps-outline';
    case 'cards':
      return 'layers-outline';
    case 'memorabilia':
      return 'ribbon-outline';
    case 'luxury':
      return 'diamond-outline';
    case 'other':
      return 'apps-outline';
    default:
      return 'ellipse-outline';
  }
}

export function BrowseScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const [active, setActive] = useState<CategoryId>('cards');
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<Product[]>([]);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setCatalog([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchMarketplaceListings({ limit: 48 });
      setCatalog(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const screenW = Dimensions.get('window').width;
  const colW = useMemo(
    () => (screenW - spacing.lg * 2 - spacing.md) / 2,
    [screenW],
  );

  const editorialPick = useMemo(() => catalog[0] ?? null, [catalog]);

  const categoryProducts = useMemo(() => catalog.filter((p) => p.category === active), [active, catalog]);

  const vaulted = useMemo(
    () => catalog.filter((p) => p.vaultVerified).slice(0, 8),
    [catalog],
  );
  const trendingGrails = useMemo(() => catalog.slice(0, 7), [catalog]);
  const rareFinds = useMemo(() => [...catalog].reverse().slice(0, 7), [catalog]);
  const luxuryWatches = useMemo(() => catalog.filter((p) => p.category === 'watches'), [catalog]);
  const sneakerHeat = useMemo(() => catalog.filter((p) => p.category === 'sneakers'), [catalog]);
  const hotSlabs = useMemo(() => catalog.filter((p) => p.category === 'cards'), [catalog]);
  const memorabiliaPicks = useMemo(() => catalog.filter((p) => p.category === 'memorabilia'), [catalog]);
  const collectorPicks = useMemo(() => catalog.slice(-6).reverse(), [catalog]);

  const openProduct = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  };

  const goLiveHub = () => navigation.navigate('Live', { screen: 'LiveDiscovery' });
  const railProps = { marketplaceMeta: true as const };

  const gridPairs = useMemo(() => {
    const rows: Product[][] = [];
    const src = catalog;
    for (let i = 0; i < src.length; i += 2) {
      rows.push(src.slice(i, i + 2));
    }
    return rows;
  }, [catalog]);

  const catalogEmpty = !loading && catalog.length === 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.head}>
        <Text style={styles.title}>Discover</Text>
        <Text style={styles.kicker}>Sports cards, breaks, sneakers, watches, and memorabilia — one vault catalog.</Text>
      </View>
      <SearchBar placeholder="Search listings, slabs, sneakers…" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {categories.map((c) => {
          const selected = c === active;
          return (
            <Pressable
              key={c}
              onPress={() => setActive(c)}
              style={[styles.chip, selected && styles.chipOn]}
            >
              <Ionicons
                name={categoryChipIcon(c)}
                size={20}
                color={selected ? colors.gold : colors.textSecondary}
              />
              <Text
                style={[styles.chipText, selected && styles.chipTextOn]}
                numberOfLines={1}
                allowFontScaling={false}
              >
                {categoryMeta[c].label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.sub}>{categoryMeta[active].tagline}</Text>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.gold} />
            <ShimmerRail count={2} height={200} />
          </View>
        ) : null}

        {catalogEmpty ? (
          <PremiumEmptyPanel
            icon="albums-outline"
            title="No vault listings yet."
            subtitle="Your next grail starts here — inventory will populate as sellers publish live listings."
          />
        ) : null}

        {!loading && editorialPick ? (
          <Pressable style={styles.editorial} onPress={() => openProduct(editorialPick)}>
            <Image
              source={{
                uri:
                  editorialPick.imageUrl ??
                  'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=1200&q=85&auto=format&fit=crop',
              }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.78)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.editorialInner}>
              <Text style={styles.editorialKicker}>Featured from the vault</Text>
              <Text style={styles.editorialTitle}>Curated listings, not market noise.</Text>
              <Text style={styles.editorialBody}>
                Every tile is a live catalog item with a clear seller and price — built for hobby pull culture and
                serious collectors.
              </Text>
              <View style={styles.editorialCta}>
                <Text style={styles.editorialCtaText}>Open featured listing</Text>
                <Ionicons name="arrow-forward" size={18} color="#0a0a0a" />
              </View>
            </View>
          </Pressable>
        ) : null}

        {!loading && vaulted.length ? (
          <View style={styles.sectionBlock}>
            <SectionHeader omitTopMargin title="Vault verified" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              {vaulted.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onPress={() => openProduct(p)}
                  variant="rail"
                  {...railProps}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {!loading && hotSlabs.length ? (
          <View style={styles.sectionBlock}>
            <SectionHeader omitTopMargin title="Card room" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              {hotSlabs.map((p) => (
                <ProductCard
                  key={`card-${p.id}`}
                  product={p}
                  onPress={() => openProduct(p)}
                  variant="rail"
                  {...railProps}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {!loading && memorabiliaPicks.length ? (
          <View style={styles.sectionBlock}>
            <SectionHeader omitTopMargin title="Legends & signed" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              {memorabiliaPicks.map((p) => (
                <ProductCard
                  key={`mem-${p.id}`}
                  product={p}
                  onPress={() => openProduct(p)}
                  variant="rail"
                  {...railProps}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {!loading && trendingGrails.length ? (
          <View style={styles.sectionBlock}>
            <SectionHeader omitTopMargin title="Fresh on the floor" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              {trendingGrails.map((p) => (
                <ProductCard
                  key={`tg-${p.id}`}
                  product={p}
                  onPress={() => openProduct(p)}
                  variant="rail"
                  {...railProps}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {!loading && rareFinds.length ? (
          <View style={styles.sectionBlock}>
            <SectionHeader omitTopMargin title="Rare finds" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              {rareFinds.map((p) => (
                <ProductCard
                  key={`rf-${p.id}`}
                  product={p}
                  onPress={() => openProduct(p)}
                  variant="rail"
                  {...railProps}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {!loading && luxuryWatches.length ? (
          <View style={styles.sectionBlock}>
            <SectionHeader omitTopMargin title="Watches" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              {luxuryWatches.map((p) => (
                <ProductCard
                  key={`lw-${p.id}`}
                  product={p}
                  onPress={() => openProduct(p)}
                  variant="rail"
                  {...railProps}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {!loading && sneakerHeat.length ? (
          <View style={styles.sectionBlock}>
            <SectionHeader omitTopMargin title="Sneaker heat" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              {sneakerHeat.map((p) => (
                <ProductCard
                  key={`sh-${p.id}`}
                  product={p}
                  onPress={() => openProduct(p)}
                  variant="rail"
                  {...railProps}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {!loading && collectorPicks.length ? (
          <View style={styles.sectionBlock}>
            <SectionHeader omitTopMargin title="Collector picks" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              {collectorPicks.map((p) => (
                <ProductCard
                  key={`cp-${p.id}`}
                  product={p}
                  onPress={() => openProduct(p)}
                  variant="rail"
                  {...railProps}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {!loading ? (
          <View style={styles.sectionBlock}>
            <SectionHeader omitTopMargin title="Recently sold" />
            <PremiumEmptyPanel
              icon="trending-down-outline"
              title="Sales feed is quiet."
              subtitle="Completed vault sales will surface here as transactions clear."
            />
          </View>
        ) : null}

        {!loading && gridPairs.length ? (
          <View style={styles.sectionBlock}>
            <SectionHeader omitTopMargin title="Recently listed" />
            <View style={styles.gridWrap}>
              {gridPairs.map((pair, rowIdx) => (
                <View key={`row-${rowIdx}`} style={styles.gridRow}>
                  {pair.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      onPress={() => openProduct(p)}
                      variant="grid"
                      gridWidth={colW}
                      marketplaceMeta
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {!loading && categoryProducts.length ? (
          <View style={styles.sectionBlock}>
            <SectionHeader omitTopMargin title={`${categoryMeta[active].label} · spotlight`} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              {categoryProducts.map((p) => (
                <ProductCard
                  key={`spot-${p.id}`}
                  product={p}
                  onPress={() => openProduct(p)}
                  variant="rail"
                  {...railProps}
                />
              ))}
            </ScrollView>
          </View>
        ) : !loading && !catalogEmpty ? (
          <View style={styles.sectionBlock}>
            <SectionHeader omitTopMargin title={`${categoryMeta[active].label} · spotlight`} />
            <PremiumEmptyPanel
              icon="file-tray-outline"
              title="Nothing in this lane yet."
              subtitle="Try another category or list your own piece to seed the vault."
            />
          </View>
        ) : null}

        <View style={styles.liveHintBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.liveHintTitle}>Buying from a live show?</Text>
            <Text style={styles.liveHintBody}>
              Jump to the Live tab for streams, break rooms, and community drops — separate from this catalog.
            </Text>
          </View>
          <Pressable style={styles.liveHintBtn} onPress={goLiveHub}>
            <Text style={styles.liveHintBtnText}>See live</Text>
          </Pressable>
        </View>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  loadingBlock: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  head: {
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  kicker: {
    color: colors.textSecondary,
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingRight: spacing.xl,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    minHeight: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: colors.surfaceElevated,
    flexShrink: 0,
  },
  chipOn: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  chipText: {
    color: 'rgba(245,245,245,0.82)',
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: -0.15,
    flexShrink: 0,
  },
  chipTextOn: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  body: {
    paddingBottom: 120,
  },
  sectionBlock: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  hRail: {
    paddingRight: spacing.lg,
  },
  editorial: {
    height: 214,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  editorialInner: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  editorialKicker: {
    ...typography.micro,
    color: colors.gold,
    marginBottom: spacing.xs,
  },
  editorialTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  editorialBody: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.sm,
    maxWidth: 320,
  },
  editorialCta: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  editorialCtaText: {
    color: '#0a0a0a',
    fontWeight: '800',
    fontSize: 14,
  },
  gridWrap: {
    gap: spacing.md,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  liveHintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginTop: spacing.xl,
  },
  liveHintTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  liveHintBody: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  liveHintBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  liveHintBtnText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
});
