export type BreakPricingMode = 'fixed' | 'auction' | 'hybrid';
export type TeamBoardLeague = 'nfl' | 'nba' | 'mlb';
export type CreateScheduleMode = 'now' | 'later';

/** Mirrors `SellerLivePage.tsx` POST /api/live-rooms body assembly. */
export type BuildCreateLiveRoomPayloadInput = {
  title: string;
  description?: string;
  category?: string;
  roomType: 'auction' | 'sale' | 'break';
  scheduleMode: CreateScheduleMode;
  scheduledStartAt?: string | null;
  thumbnailUrl?: string | null;
  teaserVideoUrl?: string | null;
  teaserVideoDurationMs?: number | null;
  teamBoardLeague?: TeamBoardLeague;
  breakTotalSpots?: string | number;
  breakPricingMode?: BreakPricingMode;
  breakSpotPrice?: string | number;
  teamSelectionBoardEnabled?: boolean;
  tipModeratorId?: string | null;
  tipsToModerator?: boolean;
  defaultShippingProfileId?: string | null;
  defaultSellerShippingProfileId?: string | null;
  shippingMode?: 'calculated' | 'capped' | 'free';
  carrierPreference?: 'usps' | 'ups' | 'best_rate';
  bundleEligiblePurchases?: boolean;
  shippingCapEnabled?: boolean;
  shippingCapCents?: number | null;
  freeShippingEnabled?: boolean;
  sellerPaysOverCap?: boolean;
  /** Weekly recurrence through 30 days — requires scheduleMode `later`. */
  recurringEnabled?: boolean;
  /** `public` (default) lists on Live Shows; `private` is link-only. */
  discoveryVisibility?: 'public' | 'private';
};

export function buildCreateLiveRoomPayload(
  input: BuildCreateLiveRoomPayloadInput,
): Record<string, unknown> {
  let scheduledStartAtIso: string | undefined;
  if (input.scheduleMode === 'later' && input.scheduledStartAt) {
    scheduledStartAtIso = input.scheduledStartAt;
  }

  const body: Record<string, unknown> = {
    title: input.title.trim(),
    description: (input.description ?? '').trim(),
    roomType: input.roomType,
    thumbnailUrl: input.thumbnailUrl?.trim() || undefined,
    ...(input.teaserVideoUrl?.trim() &&
    typeof input.teaserVideoDurationMs === 'number' &&
    Number.isFinite(input.teaserVideoDurationMs)
      ? {
          teaserVideoUrl: input.teaserVideoUrl.trim(),
          teaserVideoDurationMs: Math.round(input.teaserVideoDurationMs),
        }
      : {}),
    ...(scheduledStartAtIso ? { scheduledStartAt: scheduledStartAtIso } : {}),
  };

  const category = input.category?.trim();
  if (category) body.category = category;

  if (input.roomType === 'break') {
    const spotsNum = Math.floor(Number(input.breakTotalSpots));
    body.teamBoardLeague = input.teamBoardLeague ?? 'nfl';
    body.teamSelectionBoardEnabled = input.teamSelectionBoardEnabled !== false;
    if (Number.isFinite(spotsNum) && spotsNum >= 1 && spotsNum <= 512) {
      body.breakTotalSpots = spotsNum;
    }
    const breakPricingMode = input.breakPricingMode ?? 'auction';
    body.breakPricingMode = breakPricingMode;
    if (breakPricingMode === 'auction') {
      body.breakSpotPriceUsd = null;
    } else {
      const px = Number(input.breakSpotPrice);
      body.breakSpotPriceUsd = Number.isFinite(px) && px > 0 ? px : null;
    }
  }

  if (input.tipModeratorId) {
    body.tipModeratorId = input.tipModeratorId;
    body.tipsToModerator = input.tipsToModerator === true;
  }

  if (input.defaultSellerShippingProfileId?.trim()) {
    body.defaultSellerShippingProfileId = input.defaultSellerShippingProfileId.trim();
  } else if (input.defaultShippingProfileId?.trim()) {
    body.defaultShippingProfileId = input.defaultShippingProfileId.trim();
  }
  if (input.shippingMode) body.shippingMode = input.shippingMode;
  if (input.carrierPreference) body.carrierPreference = input.carrierPreference;
  if (typeof input.bundleEligiblePurchases === 'boolean') {
    body.bundleEligiblePurchases = input.bundleEligiblePurchases;
  }
  if (typeof input.shippingCapEnabled === 'boolean') {
    body.shippingCapEnabled = input.shippingCapEnabled;
  }
  if (input.shippingCapCents != null && Number.isFinite(input.shippingCapCents)) {
    body.shippingCapCents = Math.max(0, Math.floor(input.shippingCapCents));
  }
  if (typeof input.freeShippingEnabled === 'boolean') {
    body.freeShippingEnabled = input.freeShippingEnabled;
  }
  if (typeof input.sellerPaysOverCap === 'boolean') {
    body.sellerPaysOverCap = input.sellerPaysOverCap;
  }

  if (input.recurringEnabled && input.scheduleMode === 'later') {
    body.recurringEnabled = true;
  }

  if (input.discoveryVisibility === 'private') {
    body.discoveryVisibility = 'private';
  }

  return body;
}

export function alignScheduleToQuarterHour(d: Date): Date {
  const x = new Date(d.getTime());
  x.setSeconds(0, 0);
  x.setMilliseconds(0);
  const m = x.getMinutes();
  const rem = m % 15;
  if (rem !== 0) x.setMinutes(m + (15 - rem));
  return x;
}

export function isQuarterHourSchedule(d: Date): boolean {
  return d.getMinutes() % 15 === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
}
