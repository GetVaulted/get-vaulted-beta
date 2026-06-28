import type { LiveRoomBuyerSnapshot } from '../../api/liveRoomBuyerRepository';
import { recomputeBuyerSnapshotPhase } from '../../lib/liveBuyerSnapshotClock';
import { LIVE_AUCTION_BUYER_TIMER_ENDED_COPY } from '../../lib/liveAuctionLotPhase';
import { formatAuctionLeaderLine } from '../../lib/liveAuctionWinnerDisplay';
import {
  availableVariantCount,
  hostPinnedBuyerVariant,
  isActiveVariantBuyerItem,
  isRandomVariantAssignment,
  lowestAvailableVariantPrice,
  variantClaimPrimaryLabel,
  variantSelectSpotLabel,
} from '../../lib/liveItemVariant';
import {
  isVariantSpotAuctionLive,
  pinnedVariantAuctionPrimaryLabel,
} from '../../lib/liveVariantSpotCommerce';
import { pickVaultWaitingMessage } from '../../lib/liveAuctionBuyerVaultCopy';
import type { CategoryId, HybridFocus, LiveCommerceMode, LiveRoomFormat, LiveStream } from '../../types';

export function resolveLiveRoomFormat(stream: LiveStream): LiveRoomFormat {
  if (stream.liveRoomFormat) return stream.liveRoomFormat;
  const legacy: LiveCommerceMode | undefined = stream.liveCommerceMode;
  if (legacy === 'auction') return 'auction';
  if (legacy === 'shop') return 'shop';
  if (legacy === 'break') return 'break';
  return 'auction';
}

/** Buyer lane: break spot controls only when API confirms a break room. */
export function resolveBuyerRoomKind(
  snap: LiveRoomBuyerSnapshot | null | undefined,
  stream: LiveStream,
): 'break' | 'auction' {
  if (snap?.activeItemId && snap.status === 'live') {
    if (isActiveVariantBuyerItem(snap)) return 'break';
    return 'auction';
  }

  if (snap?.roomType === 'break') return 'break';
  if (snap?.roomType === 'auction' || snap?.roomType === 'sale') return 'auction';

  if (stream.liveRoomFormat === 'break') return 'break';
  if (stream.liveRoomFormat === 'auction' || stream.liveRoomFormat === 'shop') return 'auction';
  if (stream.liveRoomFormat === 'hybrid') {
    return effectiveHybridFocus(stream) === 'break' ? 'break' : 'auction';
  }

  return 'auction';
}

/** Team-claim CTAs only when break purchases are open and no auction lot is on screen. */
export function shouldShowBreakTeamControls(
  snap: LiveRoomBuyerSnapshot | null | undefined,
): boolean {
  if (!snap || snap.roomType !== 'break' || snap.status !== 'live') return false;
  if (snap.activeItemId) return false;
  if (snap.breakLockPurchases || snap.breakPaused || snap.breakFull) return false;
  const phase = snap.breakPhase;
  if (!phase || phase === 'not_started' || phase === 'complete' || phase === 'ready' || phase === 'filling') {
    return false;
  }
  return phase === 'in_progress' || phase === 'randomizing';
}

function resolveBuyerVariantItemHud(
  stream: LiveStream,
  snap: LiveRoomBuyerSnapshot,
  base: LiveCommerceHudModel,
): LiveCommerceHudModel {
  const variants = snap.activeItemVariants ?? [];
  const isRandom = isRandomVariantAssignment(snap.activeItemVariantAssignmentMode);
  const itemTitleFallback =
    snap.activeItemTitle?.trim() ||
    stream.currentItem?.trim() ||
    stream.pinnedProductLabel?.trim() ||
    stream.title?.trim() ||
    'Live spot board';

  if (isRandom) {
    const available = availableVariantCount(variants);
    const fromPrice = lowestAvailableVariantPrice(variants) ?? snap.priceUsd ?? snap.startingBidUsd ?? 0;
    return {
      ...base,
      format: 'shop',
      hybridFocus: null,
      timerMmSs: '—',
      itemTitle: itemTitleFallback,
      currentPrefix: available > 0 ? 'From' : 'Status',
      currentAmount: available > 0 ? formatMoney(fromPrice) : 'Sold out',
      winningLine: '',
      stateLine:
        available > 0
          ? `${available} spot${available === 1 ? '' : 's'} available — tap to spin the wheel.`
          : 'All spots are sold or unavailable.',
      bottomLeftLabel: 'Custom',
      bottomRightLabel: variantSelectSpotLabel(snap.activeItemSalesFormat, true),
      bottomRightIsSlide: false,
      buyerPrimaryDisabled: available <= 0,
      buyerSecondaryDisabled: true,
    };
  }

  const pinned = hostPinnedBuyerVariant(variants, snap.activeItemVariantAssignmentMode);
  if (pinned && isVariantSpotAuctionLive(snap)) {
    const hasBid = Boolean(snap.lastHighBidderId?.trim() || snap.lastHighBidderUsername?.trim());
    const opening = snap.startingBidUsd ?? pinned.priceUsd ?? 1;
    const displayAmount = hasBid ? (snap.currentBidUsd ?? opening) : opening;
    const next = snap.minNextBidUsd ?? displayAmount;
    const biddingOpen = snap.lotBidPhase === 'bidding_open';
    return {
      ...base,
      format: 'auction',
      hybridFocus: null,
      timerMmSs: biddingOpen && snap.auctionEndsAt ? auctionCountdownMmSs(snap.auctionEndsAt, snap.fetchedAtMs) : '—',
      itemTitle: pinned.label,
      currentPrefix: hasBid ? 'Current' : 'Opening',
      currentAmount: formatMoney(displayAmount),
      winningLine: formatAuctionLeaderLine({
        lastHighBidderUsername: snap.lastHighBidderUsername,
        lastHighBidderId: snap.lastHighBidderId,
        currentBidUsd: snap.currentBidUsd,
        startingBidUsd: snap.startingBidUsd,
      }),
      stateLine: biddingOpen
        ? 'Spot auction live — place the next bid.'
        : 'Spot auction ended — waiting for host.',
      bottomLeftLabel: 'Custom',
      bottomRightLabel: biddingOpen
        ? pinnedVariantAuctionPrimaryLabel(snap.activeItemSalesFormat, next)
        : 'Waiting for host',
      bottomRightIsSlide: biddingOpen,
      buyerPrimaryDisabled: !biddingOpen,
      buyerSecondaryDisabled: !biddingOpen,
      buyerPinnedVariantId: pinned.id,
    };
  }

  const available = availableVariantCount(variants);
  const fromPrice = lowestAvailableVariantPrice(variants) ?? snap.priceUsd ?? snap.startingBidUsd ?? 0;
  return {
    ...base,
    format: 'shop',
    hybridFocus: null,
    timerMmSs: '—',
    itemTitle: itemTitleFallback,
    currentPrefix: available > 0 ? 'From' : 'Status',
    currentAmount: available > 0 ? formatMoney(fromPrice) : 'Sold out',
    winningLine: '',
    stateLine:
      available > 0
        ? `${available} spot${available === 1 ? '' : 's'} available — tap to claim yours.`
        : 'All spots are sold or unavailable.',
    bottomLeftLabel: 'Custom',
    bottomRightLabel: available > 0 ? variantClaimPrimaryLabel(snap.activeItemSalesFormat) : 'Sold out',
    bottomRightIsSlide: false,
    buyerPrimaryDisabled: available <= 0,
    buyerSecondaryDisabled: true,
  };
}

function resolveBuyerBuyNowItemHud(
  stream: LiveStream,
  snap: LiveRoomBuyerSnapshot,
  base: LiveCommerceHudModel,
): LiveCommerceHudModel {
  const itemTitle =
    snap.activeItemTitle?.trim() ||
    stream.currentItem?.trim() ||
    stream.pinnedProductLabel?.trim() ||
    stream.title?.trim() ||
    'Live item';
  const price = snap.priceUsd ?? stream.buyNowPrice ?? 0;
  const checkoutReady = Boolean(snap.activeItemListingId?.trim());

  return {
    ...base,
    format: 'shop',
    hybridFocus: null,
    timerMmSs: '—',
    itemTitle,
    currentPrefix: 'Price',
    currentAmount: price > 0 ? formatBidMoney(price) : '—',
    winningLine: '',
    stateLine: checkoutReady
      ? 'Tap Buy Now to checkout with your saved card.'
      : 'Checkout is not linked for this item yet — ask the host in chat.',
    bottomLeftLabel: 'Custom',
    bottomRightLabel: price > 0 ? `Buy Now ${formatBidMoney(price)}` : 'Buy Now',
    bottomRightIsSlide: false,
    buyerPrimaryDisabled: !checkoutReady || price <= 0 || snap.status !== 'live',
    buyerSecondaryDisabled: true,
  };
}

function resolveBuyerAuctionItemHud(
  stream: LiveStream,
  snap: LiveRoomBuyerSnapshot,
  base: LiveCommerceHudModel,
  nowMs?: number,
): LiveCommerceHudModel {
  const wallNow = nowMs ?? snap.fetchedAtMs ?? Date.now();
  const itemTitle =
    stream.currentItem?.trim() || stream.pinnedProductLabel?.trim() || stream.title?.trim() || 'Live lot';

  if (!snap.activeItemId) {
    return buildBuyerWaitingHud(base, stream.id, {
      itemTitle: stream.currentItem?.trim() || 'Next lot',
      stateLine: pickVaultWaitingMessage(stream.id, 'stay_locked_in'),
    });
  }

  const hasBid = Boolean(snap.lastHighBidderId?.trim() || snap.lastHighBidderUsername?.trim());
  const opening = snap.startingBidUsd ?? 1;
  const displayAmount = hasBid ? (snap.currentBidUsd ?? opening) : opening;
  const next = snap.minNextBidUsd ?? displayAmount;

  if (snap.lotBidPhase === 'bidding_open') {
    return buildBuyerBidHud(base, {
      itemTitle,
      timerMmSs: auctionCountdownMmSs(snap.auctionEndsAt, wallNow),
      currentPrefix: hasBid ? 'Current' : 'Opening',
      currentAmount: formatMoney(displayAmount),
      winningLine: formatAuctionLeaderLine({
        lastHighBidderUsername: snap.lastHighBidderUsername,
        lastHighBidderId: snap.lastHighBidderId,
        currentBidUsd: snap.currentBidUsd,
        startingBidUsd: snap.startingBidUsd,
      }),
      stateLine: 'Bidding is live — place the next bid to take the lead.',
      nextBidUsd: snap.minNextBidUsd ?? displayAmount,
      biddingOpen: true,
    });
  }

  if (snap.lotBidPhase === 'timer_ended_unsettled') {
    return buildBuyerWaitingHud(base, stream.id, {
      itemTitle,
      stateLine: LIVE_AUCTION_BUYER_TIMER_ENDED_COPY,
      rightLabel: 'Bidding closed',
    });
  }

  if (snap.lotBidPhase === 'settled') {
    return buildBuyerWaitingHud(base, stream.id, {
      itemTitle,
      stateLine: 'Lot closed — watch for the next item.',
      rightLabel: 'Lot ended',
    });
  }

  return buildBuyerBidHud(base, {
    itemTitle,
    timerMmSs: '—',
    currentPrefix: 'Next bid',
    currentAmount: next > 0 ? formatBidMoney(next) : '—',
    winningLine: '',
    stateLine:
      snap.lotBidPhase === 'not_started'
        ? pickVaultWaitingMessage(stream.id, 'controls_when_live')
        : pickVaultWaitingMessage(stream.id, 'lot_almost_ready'),
    nextBidUsd: next > 0 ? next : 1,
    biddingOpen: false,
    useSlide: false,
  });
}

function buildBuyerWaitingHud(
  base: LiveCommerceHudModel,
  roomId: string,
  opts?: { itemTitle?: string; stateLine?: string; rightLabel?: string },
): LiveCommerceHudModel {
  return {
    ...base,
    format: 'auction',
    hybridFocus: null,
    timerMmSs: '—',
    itemTitle: opts?.itemTitle ?? 'Waiting for item',
    currentPrefix: 'Status',
    currentAmount: '—',
    winningLine: '',
    stateLine: opts?.stateLine ?? pickVaultWaitingMessage(roomId, 'stay_locked_in'),
    bottomLeftLabel: 'Custom',
    bottomRightLabel: opts?.rightLabel ?? 'Waiting for Item',
    bottomRightIsSlide: false,
    buyerPrimaryDisabled: true,
    buyerSecondaryDisabled: true,
  };
}

function buildBuyerBidHud(
  base: LiveCommerceHudModel,
  opts: {
    itemTitle: string;
    timerMmSs: string;
    currentPrefix: string;
    currentAmount: string;
    winningLine: string;
    stateLine: string | null;
    nextBidUsd: number;
    biddingOpen: boolean;
    useSlide?: boolean;
  },
): LiveCommerceHudModel {
  return {
    ...base,
    format: 'auction',
    hybridFocus: null,
    itemTitle: opts.itemTitle,
    timerMmSs: opts.timerMmSs,
    currentPrefix: opts.currentPrefix,
    currentAmount: opts.currentAmount,
    winningLine: opts.winningLine,
    stateLine: opts.stateLine,
    bottomLeftLabel: 'Custom',
    bottomRightLabel: `Hold to Bid ${formatBidMoney(opts.nextBidUsd)}`,
    bottomRightIsSlide: false,
    buyerPrimaryDisabled: !opts.biddingOpen,
    buyerSecondaryDisabled: false,
  };
}

function auctionCountdownMmSs(endsAt: string | null, nowMs: number): string {
  if (!endsAt) return '—';
  const end = Date.parse(endsAt);
  if (Number.isNaN(end)) return '—';
  const diffSec = Math.max(0, Math.ceil((end - nowMs) / 1000));
  return formatCountdown(diffSec);
}

export function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString('en-US')}`;
}

/** Bid CTA — always two decimal places (e.g. Bid $1.00). */
export function formatBidMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

const CATEGORY_LABELS: Record<CategoryId, string> = {
  watches: 'Watches',
  sneakers: 'Sneakers',
  cards: 'Cards',
  memorabilia: 'Memorabilia',
  luxury: 'Luxury',
  other: 'Other',
};

function formatLaneType(stream: LiveStream, format: LiveRoomFormat): string {
  if (stream.heatLabel?.trim()) return stream.heatLabel.trim();
  if (stream.categoryTags[0]?.trim()) return stream.categoryTags[0].trim();
  if (format === 'auction') return 'Live auction';
  if (format === 'break') return 'Team break';
  if (format === 'shop') return 'Buy now';
  if (format === 'drop') return 'Drop access';
  if (format === 'hybrid') return effectiveHybridFocus(stream) === 'auction' ? 'Hybrid · auction lane' : 'Hybrid · break';
  return CATEGORY_LABELS[stream.category] ?? 'Live';
}

function defaultBidIncrement(currentBid: number): number {
  if (currentBid < 100) return 5;
  if (currentBid < 500) return 25;
  if (currentBid < 2000) return 50;
  if (currentBid < 10000) return 100;
  if (currentBid < 50000) return 250;
  return 500;
}

function nextBidAmount(stream: LiveStream): number {
  const increment = stream.bidIncrementUsd ?? defaultBidIncrement(stream.currentBid);
  return stream.liveNextBidUsd ?? stream.currentBid + increment;
}

export function effectiveHybridFocus(stream: LiveStream): HybridFocus {
  return stream.hybridFocus ?? 'auction';
}

function formatHandle(raw: string | undefined): string {
  if (!raw || raw.trim() === '') return '@room';
  const t = raw.trim();
  return t.startsWith('@') ? t : `@${t}`;
}

function isAuctionLane(stream: LiveStream, format: LiveRoomFormat): boolean {
  return format === 'auction' || (format === 'hybrid' && effectiveHybridFocus(stream) === 'auction');
}

function leaderHandle(stream: LiveStream, format: LiveRoomFormat): string {
  if (stream.leadingBidderHandle) return formatHandle(stream.leadingBidderHandle.replace(/^@/, ''));
  if (isAuctionLane(stream, format) && stream.recentBids[0]?.user) {
    return formatHandle(stream.recentBids[0].user);
  }
  return formatHandle(stream.host.handle.replace(/^@/, ''));
}

/** Compact floating commerce HUD (broadcast lane + CTAs). */
export type LiveCommerceHudModel = {
  format: LiveRoomFormat;
  hybridFocus: HybridFocus | null;
  timerMmSs: string;
  itemTitle: string;
  categoryType: string;
  /** Small label above amount, e.g. "Current", "Price", "Ask". */
  currentPrefix: string;
  currentAmount: string;
  /** e.g. "Winning: @handle" — empty to hide row in shop-style lanes. */
  winningLine: string;
  /** Break / urgency line (spots, war, etc.) — optional. */
  stateLine: string | null;
  bottomLeftLabel: string;
  bottomRightLabel: string;
  bottomRightIsSlide: boolean;
  showShopButton: boolean;
  shopButtonLabel: string;
  /** Buyer auction: disable bid / slide when lot not open. */
  buyerPrimaryDisabled?: boolean;
  /** Secondary ghost CTA (Custom) — disabled while waiting for host lot. */
  buyerSecondaryDisabled?: boolean;
  /** Host-pinned PYT/PYD spot — buyer checks out this variant directly. */
  buyerPinnedVariantId?: string;
};

/** Two-row live commerce tile: title + bidder/amount; custom CTA + bid/slide. */
export type LiveMiniTileModel = {
  format: LiveRoomFormat;
  hybridFocus: HybridFocus | null;
  itemTitle: string;
  /** Top-right: "@user • $amount" or "@user • spots" */
  bidderAmountLine: string;
  bottomLeftLabel: string;
  bottomRightLabel: string;
  /** When true, bottom-right is slide rail (auction-style lanes only). */
  bottomRightIsSlide: boolean;
};

export function resolveLiveCommerceHud(stream: LiveStream): LiveCommerceHudModel {
  const format = resolveLiveRoomFormat(stream);
  const hybridFocus = format === 'hybrid' ? effectiveHybridFocus(stream) : null;
  const auctionLane = isAuctionLane(stream, format);
  const h = leaderHandle(stream, format);
  const timerMmSs = formatCountdown(stream.timeLeftSeconds);
  const categoryType = formatLaneType(stream, format);

  let currentPrefix: string;
  let currentAmount: string;
  if (auctionLane) {
    currentPrefix = 'Current';
    currentAmount = formatMoney(stream.currentBid);
  } else if (format === 'shop') {
    currentPrefix = 'Price';
    currentAmount = formatMoney(stream.buyNowPrice ?? stream.currentBid);
  } else if (format === 'drop') {
    currentPrefix = 'Ask';
    currentAmount = formatMoney(stream.buyNowPrice ?? stream.currentBid ?? stream.startingBid);
  } else {
    currentPrefix = 'Floor';
    currentAmount = formatMoney(stream.currentBid);
  }

  let winningLine = '';
  if (auctionLane) {
    winningLine = `Winning ${h}`;
  } else if (format === 'drop') {
    winningLine = `Access ${h}`;
  }

  let stateLine: string | null = null;
  if (format === 'break' || (format === 'hybrid' && hybridFocus === 'break')) {
    stateLine =
      stream.breakMomentumLine ??
      stream.urgencyLine ??
      `${Math.max(1, Math.round((1 - stream.breakProgress) * 10))} spots left`;
  } else if (format === 'auction' && stream.packStatusLine) {
    stateLine = stream.packStatusLine;
  } else if (format === 'shop' && stream.pinnedBroadcastStatus) {
    stateLine = stream.pinnedBroadcastStatus.replace(/_/g, ' ');
  }

  const next = nextBidAmount(stream);

  let bottomLeftDefault: string;
  let bottomRightDefault: string;
  if (auctionLane) {
    bottomLeftDefault = 'Chase It';
    bottomRightDefault = `Place bid ${formatMoney(next)}`;
  } else if (format === 'shop') {
    bottomLeftDefault = 'Buy Now';
    bottomRightDefault =
      stream.liveRoomTone === 'grail' ? `Secure ${formatMoney(stream.buyNowPrice ?? stream.currentBid)}` : 'Vault It';
  } else if (format === 'drop') {
    bottomLeftDefault = 'View Details';
    bottomRightDefault = 'Enter Drop';
  } else if (format === 'break' || (format === 'hybrid' && hybridFocus === 'break')) {
    bottomLeftDefault = 'Join Break';
    bottomRightDefault = 'Claim Team';
  } else {
    bottomLeftDefault = 'Custom';
    bottomRightDefault = 'Waiting for Item';
  }

  const bottomLeftLabel = stream.liveActionSecondaryLabel ?? bottomLeftDefault;
  const primaryOverride = stream.liveActionPrimaryLabel;
  const bottomRightLabel = primaryOverride ?? bottomRightDefault;

  const bottomRightIsSlide = false;

  const showShopButton = false;
  const shopButtonLabel = 'Shop';

  return {
    format,
    hybridFocus,
    timerMmSs,
    itemTitle: stream.pinnedProductLabel,
    categoryType,
    currentPrefix,
    currentAmount,
    winningLine,
    stateLine,
    bottomLeftLabel,
    bottomRightLabel,
    bottomRightIsSlide,
    showShopButton,
    shopButtonLabel,
  };
}

/**
 * Buyer overlay HUD — uses live room `roomType` from API when available.
 * Break rooms keep break CTAs; auction/sale rooms use vault waiting + bid phases.
 */
export function resolveLiveBuyerCommerceHud(
  stream: LiveStream,
  snap: LiveRoomBuyerSnapshot | null | undefined,
  nowMs?: number,
): LiveCommerceHudModel {
  const effectiveSnap =
    snap && nowMs != null ? recomputeBuyerSnapshotPhase(snap, nowMs) : snap;
  const kind = resolveBuyerRoomKind(effectiveSnap ?? null, stream);
  const auctionStream: LiveStream = {
    ...stream,
    liveRoomFormat: 'auction',
    hybridFocus: 'auction',
    liveTileUseBidSlider: stream.liveTileUseBidSlider ?? true,
  };
  const base = resolveLiveCommerceHud(auctionStream);

  if (!effectiveSnap) {
    return buildBuyerWaitingHud(base, stream.id, {
      stateLine: pickVaultWaitingMessage(stream.id, 'vault_loading'),
    });
  }

  if (effectiveSnap.status === 'scheduled') {
    return buildBuyerWaitingHud(base, stream.id, {
      itemTitle: stream.pinnedProductLabel || stream.currentItem || 'Vault event',
      stateLine: pickVaultWaitingMessage(stream.id, 'vault_loading'),
      rightLabel: 'Starting soon',
    });
  }

  if (effectiveSnap.status === 'ended') {
    return buildBuyerWaitingHud(base, stream.id, {
      stateLine: '',
      rightLabel: '—',
    });
  }

  if (isActiveVariantBuyerItem(effectiveSnap)) {
    return resolveBuyerVariantItemHud(stream, effectiveSnap, base);
  }

  if (
    effectiveSnap.roomType === 'sale' &&
    effectiveSnap.activeItemId &&
    !isActiveVariantBuyerItem(effectiveSnap)
  ) {
    return resolveBuyerBuyNowItemHud(stream, effectiveSnap, base);
  }

  if (kind === 'auction' || effectiveSnap.roomType === 'auction' || effectiveSnap.roomType === 'sale') {
    return resolveBuyerAuctionItemHud(stream, effectiveSnap, base, nowMs);
  }

  if (effectiveSnap.activeItemId) {
    return resolveBuyerAuctionItemHud(stream, effectiveSnap, base, nowMs);
  }

  if (shouldShowBreakTeamControls(effectiveSnap)) {
    return resolveLiveCommerceHud({
      ...stream,
      liveRoomFormat: 'break',
      hybridFocus: 'break',
    });
  }

  return buildBuyerWaitingHud(base, stream.id, {
    stateLine:
      effectiveSnap.roomType === 'break'
        ? 'Break controls appear when the host opens team selection.'
        : pickVaultWaitingMessage(stream.id, 'stay_locked_in'),
  });
}

export function resolveLiveMiniTile(stream: LiveStream): LiveMiniTileModel {
  const hud = resolveLiveCommerceHud(stream);
  const h = leaderHandle(stream, hud.format);
  let bidderAmountLine: string;
  if (isAuctionLane(stream, hud.format)) {
    bidderAmountLine = `${h} • ${formatMoney(stream.currentBid)}`;
  } else if (hud.format === 'shop') {
    const p = stream.buyNowPrice ?? stream.currentBid;
    bidderAmountLine = `${h} • ${formatMoney(p)}`;
  } else if (hud.format === 'drop') {
    const dropUsd = stream.buyNowPrice ?? stream.currentBid ?? stream.startingBid;
    bidderAmountLine = `${h} • ${formatMoney(dropUsd)}`;
  } else {
    bidderAmountLine = `${h} • ${formatMoney(stream.currentBid)}`;
  }

  return {
    format: hud.format,
    hybridFocus: hud.hybridFocus,
    itemTitle: hud.itemTitle,
    bidderAmountLine,
    bottomLeftLabel: hud.bottomLeftLabel,
    bottomRightLabel: hud.bottomRightLabel,
    bottomRightIsSlide: hud.bottomRightIsSlide,
  };
}
