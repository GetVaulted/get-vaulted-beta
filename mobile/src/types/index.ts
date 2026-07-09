export type CategoryId =
  | 'watches'
  | 'sneakers'
  | 'cards'
  | 'memorabilia'
  | 'luxury'
  | 'other';

const CATEGORY_IDS: CategoryId[] = ['watches', 'sneakers', 'cards', 'memorabilia', 'luxury', 'other'];

/** Maps legacy stored values (e.g. `art`) to current category ids. */
export function normalizeCategoryId(raw: string | null | undefined): CategoryId | null {
  if (!raw) return null;
  if (raw === 'art') return 'other';
  if (CATEGORY_IDS.includes(raw as CategoryId)) return raw as CategoryId;
  return null;
}

export type Host = {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string;
  verified: boolean;
  followers: string;
};

export type ChatMessageKind = 'chat' | 'system' | 'purchase' | 'bid' | 'tip';

export type ChatMessage = {
  id: string;
  user: string;
  text: string;
  senderId?: string;
  senderAvatarUrl?: string | null;
  isHost?: boolean;
  messageType?: ChatMessageKind;
  mentions?: { userId: string; username: string }[];
  /** ISO timestamp for ordering merged history (API + realtime). */
  createdAt?: string;
};

export type Bid = {
  id: string;
  user: string;
  amount: number;
  at: string;
};

export type LiveHeatVariant = 'gold' | 'live' | 'violet';

/** @deprecated Prefer `liveRoomFormat`. Mapped in `resolveLiveRoomFormat` for older mocks. */
export type LiveCommerceMode = 'break' | 'auction' | 'shop';

/** Vertical live room commerce lane — drives pinned action module. */
export type LiveRoomFormat = 'auction' | 'break' | 'shop' | 'drop' | 'hybrid';

export type HybridFocus = 'break' | 'auction';

/** Premium lane copy for memorabilia / high-end rooms. */
export type LiveRoomTone = 'standard' | 'grail';

/** Scoreboard-style chip on the pinned live item module. */
export type PinnedBroadcastStatus =
  | 'LIVE'
  | 'SOLD'
  | 'SUDDEN_DEATH'
  | 'FINAL_CALL'
  | 'NEXT_UP'
  | 'BREAK_LIVE'
  | 'PACK_LIVE'
  | 'PULL_ACTIVE';

/** Live break room / show (used in discovery + vertical room). */
export type LiveStream = {
  id: string;
  title: string;
  category: CategoryId;
  viewers: number;
  /** DB room lifecycle for playback + badges. */
  roomStatus: 'scheduled' | 'live' | 'ended';
  /** ISO scheduled start (buyer countdown / pre-live UX). */
  scheduledStartAtIso: string | null;
  /** Rich preview art — collectibles, desk breaks, host energy (shown under gradients). */
  previewImageUrl: string;
  thumbnailGradient: [string, string];
  host: Host;
  /** Legacy / pinned line in room UI */
  currentItem: string;
  startingBid: number;
  currentBid: number;
  reserve: number;
  buyNowPrice: number | null;
  timeLeftSeconds: number;
  chat: ChatMessage[];
  recentBids: Bid[];
  highlightsCount: number;
  /** Promotional copy for discovery + home cards. */
  showDescription: string;
  /** Display tags (match discovery chips where possible). */
  categoryTags: string[];
  /** One-line hype / engagement (e.g. “Chat moving fast”). */
  engagementLine: string;
  /** Optional hits callout for cards (“3 grails already hit”). */
  hitsPreview?: string;
  /** Filter chips on discovery — subset of labels. */
  discoveryTags: string[];
  /** Break room: progress 0–1 */
  breakProgress: number;
  pinnedProductLabel: string;
  giveawayLine: string;
  packStatusLine: string;
  /** FOMO / momentum label (e.g. “GRAIL ALERT”, “HEAT CHECK”). */
  heatLabel?: string;
  heatVariant?: LiveHeatVariant;
  /** Scarcity / mode line (spots left, pack war, sudden death). */
  urgencyLine?: string;
  /** Visible social proof (“Sarah hit a PSA 10”). */
  socialMoment?: string;
  messagesPerMin?: number;
  /** Floating emoji reactions beside the frame. */
  floatingReactions?: string[];
  /** Brief flash label (“BIG HIT!”, “SOLD”). */
  soldFlash?: string;
  /** Discovery + tiles: clip / trend callout. */
  clipTeaser?: string;
  /** Discovery: full-width featured break when category = All. */
  isHero?: boolean;
  /** Collapsed dock: canonical stream format (auction, break, shop, drop, hybrid). */
  liveRoomFormat?: LiveRoomFormat;
  /** When `liveRoomFormat` is `hybrid`, which lane owns the primary CTA. */
  hybridFocus?: HybridFocus;
  /** @deprecated Use `liveRoomFormat`. Still read by `resolveLiveRoomFormat`. */
  liveCommerceMode?: LiveCommerceMode;
  /** Minimum bid step for auction / hybrid auction lane (USD). */
  bidIncrementUsd?: number;
  /** Explicit next required bid; otherwise derived from current + increment. */
  liveNextBidUsd?: number;
  /** Override resolver primary CTA label (keep rare — prefer format + status). */
  liveActionPrimaryLabel?: string;
  /** Override secondary CTA label. */
  liveActionSecondaryLabel?: string;
  /** Auction lane: use compact slide rail on bottom-right instead of bid button. */
  liveTileUseBidSlider?: boolean;
  /** Memorabilia / vault grail voice for shop + auction labels. */
  liveRoomTone?: LiveRoomTone;
  pinnedItemImageUrl?: string;
  pinnedConditionGrade?: string;
  pinnedShippingLine?: string;
  pinnedBroadcastStatus?: PinnedBroadcastStatus;
  /** Break context, e.g. “4 spots · Team slots”. */
  breakMomentumLine?: string;
  /** Second line under pinned title: condition • grade • rarity (e.g. “Factory Sealed • Mint”). */
  pinnedItemSubtitle?: string;
  /** Current high bidder @handle; defaults to most recent bid user. */
  leadingBidderHandle?: string;
};

export type ScheduledStream = {
  id: string;
  title: string;
  startsAt: string;
  host: Host;
  category: CategoryId;
  reminderSet?: boolean;
  interestedCount: number;
  cardGradient: [string, string];
  eventTag: string;
  /** Cover art for discovery tiles. */
  previewImageUrl?: string;
  scheduledStartAtIso?: string | null;
};

export type ListingLiveAppearance = {
  id: string;
  title: string;
  subtitle?: string;
  occurredAtLabel?: string;
};

export type Product = {
  id: string;
  title: string;
  category: CategoryId;
  imageGradient: [string, string];
  /** Editorial / product photography (Browse, rails). */
  imageUrl?: string;
  /** Full listing gallery — first entry is featured image. */
  imageUrls?: string[];
  /** Seller-authored listing description. */
  description?: string;
  /** Short curated line for discovery cards. */
  storyline?: string;
  vaultVerified: boolean;
  /** Public seller trust badge (buyer-facing only). */
  sellerLevel?: string;
  sellerLevelLabel?: string;
  shippingPriceUsd?: number;
  handlingTimeLabel?: string;
  signatureRequired?: boolean;
  shipsFromRegion?: string;
  /** Real live show appearances — empty hides the section. */
  liveAppearances?: ListingLiveAppearance[];
  /** Single ask / buy-now price shown on marketplace cards. */
  listingPrice: string;
  /** Grade, condition, or completeness (e.g. PSA 10, unworn · papers). */
  conditionGrade?: string;
  seller: Host;
  auctionEnds?: string;
  buyNow?: string;
  /** Subtle Browse-only line when item is highlighted on a live show. */
  featuredInLive?: string;
  /** Marketplace PDP — buyer can make an offer when true. */
  allowOffers?: boolean;
  /** Marketplace PDP — buyer can start layaway when true ($500+ buy-now). */
  allowLayaway?: boolean;
  /** Marketplace PDP — buyer can start a structured trade when true. */
  acceptTradeOffers?: boolean;
  /** Trade-only lane — no buy-now checkout. */
  tradeOnly?: boolean;
  /** Canonical listing status from web API (`active`, `layaway_reserved`, `sold`, …). */
  listingStatus?: string;
};

export type SaleActivity = {
  id: string;
  item: string;
  amount: string;
  channel: string;
  timeAgo: string;
  imageUrl?: string;
  category?: CategoryId;
};

export type HotClip = {
  id: string;
  title: string;
  views: string;
  gradient: [string, string];
  category: CategoryId;
  imageUrl?: string;
  heatTag?: string;
  /** When set, opens this live room instead of the discovery hub. */
  roomId?: string;
};

export type FeaturedCreator = {
  host: Host;
  specialty: string;
  status: 'live' | 'scheduled' | 'off';
  statusLabel: string;
};

export type EndedLiveShow = {
  id: string;
  title: string;
  host: Host;
  thumbnailGradient: [string, string];
  previewImageUrl?: string;
  endedLabel: string;
  peakViewers: string;
  recapLine: string;
};
