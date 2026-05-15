import { prisma } from "@/lib/prisma";

/** Resolve `sellerId` URL segment as user id or username (not suspended). */
export async function resolveSellerFromApiParam(rawParam: string) {
  const decoded = decodeURIComponent(rawParam).trim();
  if (!decoded) return null;
  return prisma.user.findFirst({
    where: {
      OR: [{ id: decoded }, { username: decoded }],
      suspendedAt: null,
    },
    select: { id: true, username: true },
  });
}
