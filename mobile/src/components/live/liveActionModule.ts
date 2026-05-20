import type { LiveRoomBuyerSnapshot } from '../../api/liveRoomBuyerRepository';
import { LIVE_AUCTION_BUYER_TIMER_ENDED_COPY } from '../../lib/liveAuctionLotPhase';
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

/** Buyer lane: break spot controls only when API says `break`. */
export function resolveBuyerRoomKind(
  snap: LiveRoomBuyerSnapshot | null | undefined,
  stream: LiveStream,
): 'break' | 'auction' {
  if (snap?.roomType === 'break') return 'break';
  if (snap?.roomType === 'auction' || snap?.roomType === 'sale') return 'auction';
  const format = resolveLiveRoomFormat(stream);
  if (format === 'break') return 'break';
  if (format === 'hybrid' && effectiveHybridFocus(stream) === 'break') return 'break';
  return 'auction';
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
  return stream.hybridFocus ?? 'break';
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
    bottomRightDefault = `Bid ${formatMoney(next)}`;
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
    bottomLeftDefault = 'View Details';
    bottomRightDefault = 'Join Break';
  }

  const bottomLeftLabel = stream.liveActionSecondaryLabel ?? bottomLeftDefault;
  const primaryOverride = stream.liveActionPrimaryLabel;
  const bottomRightLabel = primaryOverride ?? bottomRightDefault;

  const bottomRightIsSlide =
    !primaryOverride &&
    auctionLane &&
    stream.liveTileUseBidSlider === true;

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
): LiveCommerceHudModel {
  const kind = resolveBuyerRoomKind(snap, stream);
  if (kind === 'break') {
    return resolveLiveCommerceHud({
      ...stream,
      liveRoomFormat: 'break',
      hybridFocus: 'break',
    });
  }

  const auctionStream: LiveStream = {
    ...stream,
    liveRoomFormat: 'auction',
    hybridFocus: 'auction',
    liveTileUseBidSlider: stream.liveTileUseBidSlider ?? true,
  };
  const base = resolveLiveCommerceHud(auctionStream);
  const nowMs = snap?.fetchedAtMs ?? Date.now();

  if (!snap || snap.status === 'scheduled') {
    return {
      ...base,
      format: 'auction',
      hybridFocus: null,
      categoryType: 'Live auction',
      timerMmSs: '—',
      itemTitle: stream.pinnedProductLabel || stream.currentItem || 'Vault event',
      currentPrefix: 'Status',
      currentAmount: 'Soon',
      winningLine: '',
      stateLine: pickVaultWaitingMessage(stream.id, 'vault_loading'),
      bottomLeftLabel: 'Open live room',
      bottomRightLabel: 'Starting soon',
      bottomRightIsSlide: false,
      buyerPrimaryDisabled: true,
    };
  }

  if (snap.status === 'ended') {
    return {
      ...base,
      timerMmSs: '—',
      winningLine: '',
      stateLine: 'This show has ended.',
      bottomLeftLabel: 'Open live room',
      bottomRightLabel: 'Show ended',
      bottomRightIsSlide: false,
      buyerPrimaryDisabled: true,
    };
  }

  if (!snap.activeItemId) {
    return {
      ...base,
      itemTitle: stream.currentItem?.trim() || 'Next lot',
      timerMmSs: '—',
      currentPrefix: 'Next bid',
      currentAmount: '—',
      winningLine: '',
      stateLine: pickVaultWaitingMessage(stream.id, 'stay_locked_in'),
      bottomLeftLabel: 'Open live room',
      bottomRightLabel: 'Lot loading',
      bottomRightIsSlide: false,
      buyerPrimaryDisabled: true,
    };
  }

  const current = snap.currentBidUsd ?? 0;
  const next = snap.minNextBidUsd ?? current;

  if (snap.lotBidPhase === 'bidding_open') {
    return {
      ...base,
      itemTitle: stream.currentItem?.trim() || stream.pinnedProductLabel,
      timerMmSs: auctionCountdownMmSs(snap.auctionEndsAt, nowMs),
      currentPrefix: 'Current',
      currentAmount: formatMoney(current),
      winningLine: current > 0 ? 'High bid on the floor' : '',
      stateLine: 'Bidding is live — place the next bid to take the lead.',
      bottomLeftLabel: 'Open live room',
      bottomRightLabel: `Bid ${formatMoney(next)}`,
      bottomRightIsSlide: true,
      buyerPrimaryDisabled: false,
    };
  }

  if (snap.lotBidPhase === 'timer_ended_unsettled') {
    return {
      ...base,
      timerMmSs: '0:00',
      currentPrefix: 'Current',
      currentAmount: formatMoney(current),
      winningLine: '',
      stateLine: LIVE_AUCTION_BUYER_TIMER_ENDED_COPY,
      bottomLeftLabel: 'Open live room',
      bottomRightLabel: 'Bidding closed',
      bottomRightIsSlide: false,
      buyerPrimaryDisabled: true,
    };
  }

  if (snap.lotBidPhase === 'settled') {
    return {
      ...base,
      timerMmSs: '—',
      currentPrefix: 'Final',
      currentAmount: formatMoney(current),
      winningLine: '',
      stateLine: 'Lot closed — watch for the next item.',
      bottomLeftLabel: 'Open live room',
      bottomRightLabel: 'Lot ended',
      bottomRightIsSlide: false,
      buyerPrimaryDisabled: true,
    };
  }

  return {
    ...base,
    timerMmSs: '—',
    currentPrefix: 'Next bid',
    currentAmount: next > 0 ? formatMoney(next) : '—',
    winningLine: '',
    stateLine:
      snap.lotBidPhase === 'not_started'
        ? pickVaultWaitingMessage(stream.id, 'controls_when_live')
        : pickVaultWaitingMessage(stream.id, 'lot_almost_ready'),
    bottomLeftLabel: 'Open live room',
    bottomRightLabel: 'Bids open soon',
    bottomRightIsSlide: false,
    buyerPrimaryDisabled: true,
  };
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
