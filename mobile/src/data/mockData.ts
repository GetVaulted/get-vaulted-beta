import type {
  CategoryId,
  EndedLiveShow,
  FeaturedCreator,
  HotClip,
  LiveStream,
  Product,
  SaleActivity,
  ScheduledStream,
} from '../types';

/** Home / Discover / Live rails use Supabase feeds only — no seeded listings or hosts. */
export const liveStreams: LiveStream[] = [];
export const trendingBreakerShows: LiveStream[] = [];
export const recommendedShows: LiveStream[] = [];
export const endedLiveShows: EndedLiveShow[] = [];
export const scheduledStreams: ScheduledStream[] = [];
export const featuredCreators: FeaturedCreator[] = [];
export const featuredHosts = featuredCreators.map((c) => c.host);
export const hotClips: HotClip[] = [];

export const momentumSnapshot = {
  soldToday: '—',
  soldTodaySub: 'Metrics when the marketplace is live',
  watching: '—',
  watchingSub: 'Tune in when breakers go live',
  ending: '—',
  endingSub: 'No shows ending',
} as const;

export const trendingProducts: Product[] = [];

const emptyCategories: CategoryId[] = ['watches', 'sneakers', 'cards', 'memorabilia', 'luxury', 'other'];
export const browseProductsByCategory: Record<CategoryId, Product[]> = Object.fromEntries(
  emptyCategories.map((c) => [c, [] as Product[]]),
) as Record<CategoryId, Product[]>;

export const recentSalesFeed: SaleActivity[] = [];

export { categoryMeta, discoveryCategoryChips, filterShowsByChip } from './categoryTaxonomy';
