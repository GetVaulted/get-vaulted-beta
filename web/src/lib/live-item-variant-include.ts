/** Shared Prisma include for live queue items with selectable variants. */

export const liveRoomItemsWithVariantsInclude = {
  orderBy: { sortOrder: "asc" as const },
  include: {
    variants: {
      orderBy: { sortOrder: "asc" as const },
      include: {
        purchases: {
          where: { paymentStatus: "paid" as const },
          orderBy: { paidAt: "desc" as const },
          take: 1,
          include: {
            buyer: { select: { username: true } as const },
          },
        },
      },
    },
  },
} as const;

/** Host console — variants only; paid buyer usernames attached in one batch query. */
export const liveRoomItemsHostConsoleInclude = {
  orderBy: { sortOrder: "asc" as const },
  include: {
    variants: {
      orderBy: { sortOrder: "asc" as const },
    },
  },
} as const;
