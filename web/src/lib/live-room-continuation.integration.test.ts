import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  findLiveRoomContinuationCandidate,
  isEligibleLiveRoomContinuationCandidate,
  LIVE_ROOM_CONTINUATION_WINDOW_MS,
} from "@/lib/live-room-continuation";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedSellerStripeReady,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

describe("live room continuation candidate (integration)", () => {
  beforeAll(async () => {
    await bootstrapIntegrationPrisma();
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  async function seedEndedRoom(sellerId: string, opts: { roomType: "auction" | "sale" | "break"; endedAt: Date }) {
    return prisma.liveRoom.create({
      data: {
        sellerId,
        title: "Ended show",
        roomType: opts.roomType,
        status: "ended",
        endedAt: opts.endedAt,
      },
    });
  }

  it("offers a show ended minutes ago as a candidate", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "cont1_s@test.internal", username: "cont1seller" });
    const ended = await seedEndedRoom(seller.id, { roomType: "break", endedAt: new Date(Date.now() - 5 * 60_000) });

    const candidate = await findLiveRoomContinuationCandidate({ sellerId: seller.id, roomType: "break" });
    expect(candidate?.id).toBe(ended.id);
  });

  it("never offers a show that ended more than 24 hours ago", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "cont2_s@test.internal", username: "cont2seller" });
    await seedEndedRoom(seller.id, {
      roomType: "break",
      endedAt: new Date(Date.now() - LIVE_ROOM_CONTINUATION_WINDOW_MS - 60_000),
    });

    const candidate = await findLiveRoomContinuationCandidate({ sellerId: seller.id, roomType: "break" });
    expect(candidate).toBeNull();
  });

  it("never offers a show of a different roomType or a different seller", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "cont3_s@test.internal", username: "cont3seller" });
    const otherSeller = await seedSellerStripeReady(prisma, { email: "cont3_s2@test.internal", username: "cont3seller2" });
    await seedEndedRoom(seller.id, { roomType: "auction", endedAt: new Date(Date.now() - 60_000) });
    await seedEndedRoom(otherSeller.id, { roomType: "break", endedAt: new Date(Date.now() - 60_000) });

    const candidate = await findLiveRoomContinuationCandidate({ sellerId: seller.id, roomType: "break" });
    expect(candidate).toBeNull();
  });

  it("re-validation rejects a candidate id past the 24h window even if the client sends it", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "cont4_s@test.internal", username: "cont4seller" });
    const staleRoom = await seedEndedRoom(seller.id, {
      roomType: "break",
      endedAt: new Date(Date.now() - LIVE_ROOM_CONTINUATION_WINDOW_MS - 60_000),
    });

    const eligible = await isEligibleLiveRoomContinuationCandidate({
      sellerId: seller.id,
      roomType: "break",
      candidateId: staleRoom.id,
    });
    expect(eligible).toBe(false);
  });

  it("re-validation rejects a candidate belonging to a different seller (spoofed id)", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "cont5_s@test.internal", username: "cont5seller" });
    const otherSeller = await seedSellerStripeReady(prisma, { email: "cont5_s2@test.internal", username: "cont5seller2" });
    const otherRoom = await seedEndedRoom(otherSeller.id, { roomType: "break", endedAt: new Date(Date.now() - 60_000) });

    const eligible = await isEligibleLiveRoomContinuationCandidate({
      sellerId: seller.id,
      roomType: "break",
      candidateId: otherRoom.id,
    });
    expect(eligible).toBe(false);
  });

  it("re-validation accepts a genuinely eligible candidate", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "cont6_s@test.internal", username: "cont6seller" });
    const room = await seedEndedRoom(seller.id, { roomType: "break", endedAt: new Date(Date.now() - 60_000) });

    const eligible = await isEligibleLiveRoomContinuationCandidate({
      sellerId: seller.id,
      roomType: "break",
      candidateId: room.id,
    });
    expect(eligible).toBe(true);
  });
});
