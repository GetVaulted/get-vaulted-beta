import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchLiveShowsForDiscovery } from '../api/liveShowsDiscoveryRepository';
import { PremiumEmptyPanel } from '../components/empty/PremiumEmptyPanel';
import { HotClipCard } from '../components/home/HotClipCard';
import { VaultDropCard } from '../components/home/VaultDropCard';
import { DiscoveryShowTile } from '../components/live/DiscoveryShowTile';
import { LiveEmptyBroadcastBlock } from '../components/live/LiveEmptyBroadcastBlock';
import { SearchBar } from '../components/ui/SearchBar';
import { ShimmerRail } from '../components/ui/ShimmerRail';
import { SectionHeader } from '../components/ui/SectionHeader';
import { discoveryCategoryChips, filterShowsByChip } from '../data/categoryTaxonomy';
import { isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import type { LiveStackParamList, MainTabParamList } from '../navigation/types';
import { alertGuestLiveRestricted } from '../navigation/guestExploreGuards';
import { colors, radii, spacing, typography } from '../theme';
import type { EndedLiveShow, HotClip, LiveStream, ScheduledStream } from '../types';

function liveChipIcon(label: string): keyof typeof Ionicons.glyphMap | undefined {
  switch (label) {
    case 'Breaks':
      return 'file-tray-stacked-outline';
    case 'Memorabilia':
      return 'shirt-outline';
    case 'Cards':
      return 'layers-outline';
    case 'Sneakers':
      return 'footsteps-outline';
    case 'Watches':
      return 'time-outline';
    case 'Luxury':
      return 'diamond-outline';
    case 'Vault Drops':
      return 'archive-outline';
    case 'Other':
      return 'apps-outline';
    case 'All':
      return 'apps-outline';
    default:
      return undefined;
  }
}

function chipInactiveAccent(label: string): { border: string; fill: string } {
  switch (label) {
    case 'Breaks':
      return { border: 'rgba(130, 150, 255, 0.28)', fill: 'rgba(26, 28, 44, 0.96)' };
    case 'Memorabilia':
      return { border: 'rgba(230, 150, 110, 0.28)', fill: 'rgba(36, 24, 20, 0.96)' };
    case 'Cards':
      return { border: 'rgba(110, 200, 190, 0.28)', fill: 'rgba(18, 32, 30, 0.96)' };
    case 'Sneakers':
      return { border: 'rgba(140, 170, 255, 0.24)', fill: 'rgba(24, 26, 40, 0.96)' };
    case 'Watches':
      return { border: 'rgba(212, 175, 55, 0.26)', fill: 'rgba(32, 28, 18, 0.96)' };
    case 'Luxury':
      return { border: 'rgba(230, 210, 160, 0.24)', fill: 'rgba(34, 30, 22, 0.96)' };
    case 'Vault Drops':
      return { border: 'rgba(200, 165, 95, 0.28)', fill: 'rgba(34, 28, 18, 0.96)' };
    case 'Other':
      return { border: 'rgba(140, 180, 220, 0.26)', fill: 'rgba(22, 28, 36, 0.96)' };
    case 'All':
    default:
      return { border: 'rgba(255,255,255,0.14)', fill: 'rgba(28,28,28,0.94)' };
  }
}

function EndedShowCard({ show, onOpen }: { show: EndedLiveShow; onOpen: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.endedCard, pressed && styles.pressed]}
      onPress={onOpen}
    >
      <View style={styles.endedGrad}>
        {show.previewImageUrl ? (
          <Image source={{ uri: show.previewImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
        <LinearGradient
          colors={show.thumbnailGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, !!show.previewImageUrl && styles.endedTint]}
        />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.88)']} style={StyleSheet.absoluteFill} />
        <View style={styles.endedBottom}>
          <Text style={styles.endedTitle} numberOfLines={2}>
            {show.title}
          </Text>
          <Text style={styles.endedMeta}>
            {show.endedLabel} · {show.peakViewers}
          </Text>
          <Text style={styles.endedRecap} numberOfLines={2}>
            {show.recapLine}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function LiveDiscoveryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<LiveStackParamList>>();
  const tabNavigation = navigation.getParent<BottomTabNavigationProp<MainTabParamList>>();
  const { guestExploreMode } = useAuth();
  const [chip, setChip] = useState<string>('Breaks');
  const [loading, setLoading] = useState(true);
  const [liveAll, setLiveAll] = useState<LiveStream[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledStream[]>([]);
  const [trendingBreakers, setTrendingBreakers] = useState<LiveStream[]>([]);
  const [recommended, setRecommended] = useState<LiveStream[]>([]);
  const [ended, setEnded] = useState<EndedLiveShow[]>([]);
  const [clips, setClips] = useState<HotClip[]>([]);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLiveAll([]);
      setScheduled([]);
      setTrendingBreakers([]);
      setRecommended([]);
      setEnded([]);
      setClips([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const pack = await fetchLiveShowsForDiscovery();
      setLiveAll(pack.live);
      setScheduled(pack.scheduled);
      setTrendingBreakers(pack.live.slice(0, 6));
      setRecommended(pack.live.slice(0, 4));
      setEnded([]);
      setClips([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredLive = useMemo(() => filterShowsByChip(liveAll, chip), [liveAll, chip]);

  const heroCandidate = useMemo(() => {
    if (!filteredLive.length) return null;
    const idx = new Date().getHours() % filteredLive.length;
    return filteredLive[idx];
  }, [filteredLive]);

  const heroInFilter = useMemo(() => {
    if (!heroCandidate || !filteredLive.some((s) => s.id === heroCandidate.id)) return null;
    return heroCandidate;
  }, [filteredLive, heroCandidate]);

  const liveNowRows = useMemo(
    () => (heroInFilter ? filteredLive.filter((s) => s.id !== heroInFilter.id) : filteredLive),
    [filteredLive, heroInFilter],
  );

  const openShow = (show: LiveStream) => {
    if (guestExploreMode) {
      alertGuestLiveRestricted();
      return;
    }
    navigation.navigate('LiveRoom', { streamId: show.id });
  };

  const liveEmpty = !loading && liveAll.length === 0;
  const filterEmpty = !loading && liveAll.length > 0 && filteredLive.length === 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.head}>
        <View>
          <Text style={styles.title}>Live shows</Text>
          <Text style={styles.sub}>
            Breaks, slabs, and hobby rooms — a live network built for pull culture and serious collectors.
          </Text>
        </View>
        <Pressable
          style={styles.filterBtn}
          onPress={() => tabNavigation?.navigate('Discover')}
        >
          <Ionicons name="options-outline" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>
      <SearchBar placeholder="Search breakers, vault hosts, shows…" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        contentContainerStyle={styles.chips}
      >
        {discoveryCategoryChips.map((c) => {
          const on = c === chip;
          const icon = liveChipIcon(c);
          const tone = chipInactiveAccent(c);
          return (
            <Pressable
              key={c}
              onPress={() => setChip(c)}
              style={[
                styles.chip,
                !on && { borderColor: tone.border, backgroundColor: tone.fill },
                on && styles.chipOn,
              ]}
            >
              {icon ? (
                <Ionicons
                  name={icon}
                  size={17}
                  color={on ? colors.gold : 'rgba(245,245,245,0.58)'}
                  style={styles.chipIcon}
                />
              ) : null}
              <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                {c}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.gold} />
            <ShimmerRail count={3} height={220} />
          </View>
        ) : null}

        {liveEmpty ? <LiveEmptyBroadcastBlock /> : null}

        {filterEmpty ? (
          <PremiumEmptyPanel
            icon="funnel-outline"
            title="Nothing in this filter yet."
            subtitle="Try another category, or check back as hosts schedule new shows."
          />
        ) : null}

        {!loading && !liveEmpty && !filterEmpty && heroInFilter ? (
          <>
            <SectionHeader title="Featured show" />
            <View style={styles.heroSlot}>
              <DiscoveryShowTile show={heroInFilter} variant="hero" onPress={() => openShow(heroInFilter)} />
            </View>
          </>
        ) : null}

        {!loading && !liveEmpty ? (
          <>
            <SectionHeader title="Live now" />
            <FlatList
              horizontal
              data={liveNowRows}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
              ListEmptyComponent={
                <Text style={styles.empty}>No additional shows in this filter.</Text>
              }
              renderItem={({ item }) => <DiscoveryShowTile show={item} onPress={() => openShow(item)} />}
            />
          </>
        ) : null}

        {!loading && trendingBreakers.length > 0 ? (
          <>
            <SectionHeader title="Trending breakers" />
            <FlatList
              horizontal
              data={trendingBreakers}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
              renderItem={({ item }) => (
                <DiscoveryShowTile show={item} onPress={() => openShow(item)} variant="compact" />
              )}
            />
          </>
        ) : null}

        {clips.length > 0 ? (
          <>
            <SectionHeader title="Hit clips" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
              {clips.map((clip) => (
                <HotClipCard key={clip.id} clip={clip} />
              ))}
            </ScrollView>
          </>
        ) : null}

        <SectionHeader title="Upcoming shows" />
        {scheduled.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
            {scheduled.map((s) => (
              <VaultDropCard
                key={s.id}
                event={s}
                onRemind={() => tabNavigation?.navigate('HQ')}
              />
            ))}
          </ScrollView>
        ) : (
          <PremiumEmptyPanel
            icon="calendar-outline"
            title="No scheduled drops yet"
            subtitle="The next break is loading — publish a show from Seller HQ when you are ready."
            actions={[
              {
                label: 'Schedule your first live show',
                onPress: () =>
                  navigation.getParent<BottomTabNavigationProp<MainTabParamList>>()?.navigate('HQ'),
              },
            ]}
          />
        )}

        {ended.length > 0 ? (
          <>
            <SectionHeader title="Recently ended" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
              {ended.map((e) => (
                <EndedShowCard
                  key={e.id}
                  show={e}
                  onOpen={() => {
                    if (guestExploreMode) {
                      alertGuestLiveRestricted();
                      return;
                    }
                    navigation.navigate('LiveRoom', { streamId: e.id });
                  }}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        {!loading && recommended.length > 0 ? (
          <>
            <SectionHeader title="Recommended for you" />
            <FlatList
              horizontal
              data={recommended}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
              renderItem={({ item }) => <DiscoveryShowTile show={item} onPress={() => openShow(item)} />}
            />
          </>
        ) : null}

        <SectionHeader title="Categories" />
        <View style={styles.catGrid}>
          {discoveryCategoryChips
            .filter((c) => c !== 'All')
            .map((c) => {
              const tone = chipInactiveAccent(c);
              const sel = c === chip;
              const icon = liveChipIcon(c);
              return (
                <Pressable
                  key={c}
                  style={[
                    styles.catPill,
                    !sel && { borderColor: tone.border, backgroundColor: tone.fill },
                    sel && styles.catPillSelected,
                  ]}
                  onPress={() => setChip(c)}
                >
                  {icon ? (
                    <Ionicons name={icon} size={14} color={sel ? colors.gold : 'rgba(245,245,245,0.52)'} />
                  ) : null}
                  <Text style={[styles.catPillText, sel && styles.catPillTextSelected]}>{c}</Text>
                </Pressable>
              );
            })}
        </View>

        <View style={{ height: 120 }} />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    maxWidth: 320,
  },
  filterBtn: {
    padding: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
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
    flexShrink: 0,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(28,28,28,0.94)',
  },
  chipOn: {
    borderColor: 'rgba(212,175,55,0.55)',
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  chipIcon: {
    marginRight: 7,
  },
  chipText: {
    color: 'rgba(245,245,245,0.88)',
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: -0.15,
  },
  chipTextOn: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  body: {
    paddingBottom: spacing.xxl,
  },
  heroSlot: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  endedTint: {
    opacity: 0.42,
  },
  hList: {
    paddingRight: spacing.lg,
    marginBottom: spacing.lg,
  },
  empty: {
    color: colors.textMuted,
    paddingVertical: spacing.lg,
    fontSize: 14,
  },
  endedCard: {
    width: 180,
    marginRight: spacing.md,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.9,
  },
  endedGrad: {
    minHeight: 200,
    justifyContent: 'flex-end',
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  endedBottom: {
    padding: spacing.md,
    zIndex: 2,
  },
  endedTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
  endedMeta: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  endedRecap: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    minHeight: 42,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(28,28,28,0.94)',
    gap: 6,
  },
  catPillSelected: {
    borderColor: 'rgba(212,175,55,0.55)',
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  catPillText: {
    color: 'rgba(245,245,245,0.9)',
    fontWeight: '600',
    fontSize: 14,
  },
  catPillTextSelected: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
