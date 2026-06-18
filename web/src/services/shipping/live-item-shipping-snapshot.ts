import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import {
  resolveShippingProfileDimensions,
  serializeProfileSnapshot,
} from "@/lib/unified-shipping-engine";
import { resolveDefaultProfileForLiveShow } from "@/services/shipping/platform-shipping-profiles";

/** Persist resolved profile dims on a sold queue item (idempotent). */
export async function captureLiveRoomItemShippingSnapshotTx(
  tx: TransactionClient,
  liveRoomItemId: string,
): Promise<void> {
  const item = await tx.liveRoomItem.findUnique({
    where: { id: liveRoomItemId },
    select: {
      id: true,
      shippingProfileSnapshotJson: true,
      shippingProfileId: true,
      customWeightOz: true,
      customLengthIn: true,
      customWidthIn: true,
      customHeightIn: true,
      requiresSeparatePackage: true,
      shippingProfile: true,
      liveRoom: { select: { defaultShippingProfileId: true, category: true } },
    },
  });
  if (!item || item.shippingProfileSnapshotJson?.trim()) return;

  let profile = item.shippingProfile;
  if (!profile) {
    profile = await resolveDefaultProfileForLiveShow({
      showDefaultProfileId: item.liveRoom.defaultShippingProfileId,
      category: item.liveRoom.category,
      db: tx,
    });
  }
  if (!profile) return;

  const resolved = resolveShippingProfileDimensions(profile, item);
  await tx.liveRoomItem.update({
    where: { id: liveRoomItemId },
    data: { shippingProfileSnapshotJson: serializeProfileSnapshot(resolved) },
  });
}
