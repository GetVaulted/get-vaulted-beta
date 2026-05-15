import type { BreakHit, BreakSpot, LiveRoom, LiveRoomItem, LiveRoomStatus, User } from "@/generated/prisma/client";
import { parseTeamLabelsJson } from "@/lib/live-room-host-auth";

export type BreakBuyerPhase =
  | "not_started"
  | "filling"
  | "randomizing"
  | "ready"
  | "in_progress"
  | "complete";

export type BreakSpotDisplayStatus = "available" | "claimed" | "paid" | "locked" | "skipped";

export type LiveRoomBreakQueueSpotClaimDTO = {
  claimId: string;
  buyerUserId: string;
  buyerUsername: string | null;
  displayStatus: Exclude<BreakSpotDisplayStatus, "available" | "skipped">;
  breakPaymentStatus: string | null;
};

export type LiveRoomBreakQueueSpotDTO = {
  liveRoomItemId: string;
  label: string;
  priceUsd: number | null;
  itemStatus: string;
  /** `LiveRoomItem.quantity` (min 1). */
  quantity: number;
  /** Count of `BreakSpot` rows for this queue item. */
  unitsClaimed: number;
  buyerUsername: string | null;
  buyerUserId: string | null;
  displayStatus: BreakSpotDisplayStatus;
  claimId: string | null;
  /** One entry per break spot linked to this item (for multi-quantity lots). */
  spotClaims: LiveRoomBreakQueueSpotClaimDTO[];
  /** Stripe checkout still required (claim confirmed, payment not cleared). */
  needsPayment: boolean;
  /** From `BreakSpot.breakPaymentStatus` when claimed (`unpaid` … `paid`). */
  breakPaymentStatus: string | null;
};

export type LiveRoomBreakOrphanSpotDTO = {
  id: string;
  spotLabel: string;
  priceUsd: number;
  buyerUsername: string;
  buyerUserId: string;
  displayStatus: BreakSpotDisplayStatus;
  needsPayment: boolean;
  breakPaymentStatus: string;
};

export type LiveRoomBreakRandomizationDTO = {
  locked: boolean;
  seed: string | null;
  confirmedAt: string | null;
  assignments: { order: number; label: string }[];
};

export type LiveRoomBreakHitDTO = {
  id: string;
  title: string;
  spotLabel: string;
  buyerUsername: string | null;
  createdAt: string;
};

export type LiveRoomBreakPublicDTO = {
  displayTitle: string;
  breakFormat: string;
  phase: BreakBuyerPhase;
  breakPaused: boolean;
  lockPurchases: boolean;
  breakFull: boolean;
  queueSpots: LiveRoomBreakQueueSpotDTO[];
  orphanSpots: LiveRoomBreakOrphanSpotDTO[];
  randomization: LiveRoomBreakRandomizationDTO | null;
  hits: LiveRoomBreakHitDTO[];
};

function mapClaimToDisplay(claimStatus: string): Exclude<BreakSpotDisplayStatus, "available" | "skipped"> {
  if (claimStatus === "paid") return "paid";
  if (claimStatus === "locked") return "locked";
  return "claimed";
}

export function computeBreakBuyerPhase(
  room: Pick<LiveRoom, "status" | "randomizedAt" | "randomizationPreviewJson" | "randomizationResultJson">,
  activeClaimCount: number,
): BreakBuyerPhase {
  if (room.status === "scheduled") return "not_started";
  if (room.status === "ended") return "complete";

  const hasPreview = Boolean(room.randomizationPreviewJson?.trim());
  const hasResult = Boolean(room.randomizationResultJson?.trim());
  const randomized = Boolean(room.randomizedAt);

  if (hasPreview && !randomized) return "randomizing";
  if (hasResult && randomized) {
    if (activeClaimCount > 0) return "in_progress";
    return "ready";
  }
  if (activeClaimCount > 0) return "in_progress";
  return "filling";
}

type SpotRow = BreakSpot & { user: Pick<User, "username"> };
type HitRow = BreakHit & { buyer: { username: string } | null };

export function buildBreakPublicSnapshot(
  room: LiveRoom,
  items: LiveRoomItem[],
  breakSpots: SpotRow[],
  breakHits: HitRow[],
): LiveRoomBreakPublicDTO {
  const itemsSorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
  const spotsByItemId = new Map<string, SpotRow[]>();
  for (const s of breakSpots) {
    if (!s.liveRoomItemId) continue;
    const list = spotsByItemId.get(s.liveRoomItemId) ?? [];
    list.push(s);
    spotsByItemId.set(s.liveRoomItemId, list);
  }
  for (const [, row] of spotsByItemId) {
    row.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  const activeClaimCount = breakSpots.length;

  const phase = computeBreakBuyerPhase(room, activeClaimCount);

  const queueSpots: LiveRoomBreakQueueSpotDTO[] = itemsSorted.map((item) => {
    const claims = spotsByItemId.get(item.id) ?? [];
    const qty = Math.max(1, item.quantity);
    const unitsClaimed = claims.length;
    const primary = claims[0];
    const spotClaims: LiveRoomBreakQueueSpotClaimDTO[] = claims.map((c) => ({
      claimId: c.id,
      buyerUserId: c.userId,
      buyerUsername: c.user.username,
      displayStatus: mapClaimToDisplay(c.claimStatus),
      breakPaymentStatus: c.breakPaymentStatus,
    }));

    let displayStatus: BreakSpotDisplayStatus;
    if (item.status === "skipped") displayStatus = "skipped";
    else if (unitsClaimed >= qty) displayStatus = mapClaimToDisplay(claims[claims.length - 1]!.claimStatus);
    else if (unitsClaimed > 0) displayStatus = "available";
    else if (item.status === "sold") displayStatus = "claimed";
    else displayStatus = "available";

    const rowNeedsPayment = (c: SpotRow) =>
      mapClaimToDisplay(c.claimStatus) === "claimed" &&
      c.breakPaymentStatus !== "paid" &&
      c.breakPaymentStatus !== "locked";

    const needsPayment = claims.some((c) => rowNeedsPayment(c));

    return {
      liveRoomItemId: item.id,
      label: item.title,
      priceUsd: item.priceUsd,
      itemStatus: item.status,
      quantity: qty,
      unitsClaimed,
      buyerUsername: primary ? primary.user.username : null,
      buyerUserId: primary ? primary.userId : null,
      displayStatus,
      claimId: primary?.id ?? null,
      spotClaims,
      needsPayment,
      breakPaymentStatus: primary ? primary.breakPaymentStatus : null,
    };
  });

  const orphanSpots: LiveRoomBreakOrphanSpotDTO[] = breakSpots
    .filter((s) => !s.liveRoomItemId)
    .map((s) => {
      const displayStatus = mapClaimToDisplay(s.claimStatus);
      return {
        id: s.id,
        spotLabel: s.spotLabel,
        priceUsd: s.priceUsd,
        buyerUsername: s.user.username,
        buyerUserId: s.userId,
        displayStatus,
        needsPayment: displayStatus === "claimed",
        breakPaymentStatus: s.breakPaymentStatus,
      };
    });

  let randomization: LiveRoomBreakRandomizationDTO | null = null;
  if (room.randomizationResultJson?.trim() && room.randomizedAt) {
    let assignments: { order: number; label: string }[] = [];
    try {
      const j = JSON.parse(room.randomizationResultJson) as { assignments?: { order: number; label: string }[] };
      if (Array.isArray(j.assignments)) assignments = j.assignments;
    } catch {
      assignments = [];
    }
    randomization = {
      locked: Boolean(room.assignmentsLockedAt),
      seed: room.randomizationSeed,
      confirmedAt: room.randomizedAt.toISOString(),
      assignments,
    };
  }

  const hits: LiveRoomBreakHitDTO[] = breakHits.map((h) => ({
    id: h.id,
    title: h.title,
    spotLabel: h.spotLabel,
    buyerUsername: h.buyer?.username ?? null,
    createdAt: h.createdAt.toISOString(),
  }));

  const displayTitle = room.breakDisplayTitle?.trim() || room.title;

  return {
    displayTitle,
    breakFormat: room.breakFormat ?? "pick_your_team",
    phase,
    breakPaused: room.breakPaused,
    lockPurchases: room.lockPurchases,
    breakFull: Boolean(room.breakFilledLockedAt),
    queueSpots,
    orphanSpots,
    randomization,
    hits,
  };
}

/** Expose team labels for UI (same source as host randomization). */
export function breakTeamLabelsForPublic(room: Pick<LiveRoom, "breakTeamLabelsJson">): string[] {
  return parseTeamLabelsJson(room.breakTeamLabelsJson);
}
