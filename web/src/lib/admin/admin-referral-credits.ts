import { ReferralCreditRole, ReferralCreditStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

const ALL_STATUSES: ReferralCreditStatus[] = [
  ReferralCreditStatus.pending,
  ReferralCreditStatus.available,
  ReferralCreditStatus.reserved,
  ReferralCreditStatus.spent,
  ReferralCreditStatus.voided,
];

export type AdminReferralCreditSummary = {
  byStatus: Array<{
    status: ReferralCreditStatus;
    count: number;
    amountUsd: number;
  }>;
  totalGrantedUsd: number;
  totalOutstandingUsd: number;
  totalSpentUsd: number;
  totalVoidedUsd: number;
  attributedUsers: number;
};

export type AdminReferralCreditRow = {
  id: string;
  status: ReferralCreditStatus;
  role: ReferralCreditRole;
  amountUsd: number;
  availableAt: string;
  createdAt: string;
  voidReason: string | null;
  voidedAt: string | null;
  reservedForRef: string | null;
  spentAt: string | null;
  user: { id: string; username: string; email: string; referralCode: string | null };
  sourceOrder: {
    id: string;
    totalUsd: number;
    paymentStatus: string;
    buyer: { id: string; username: string };
  };
  spentOrderId: string | null;
};

export type AdminReferralWalletRow = {
  userId: string;
  username: string;
  email: string;
  referralCode: string | null;
  availableUsd: number;
  pendingUsd: number;
  reservedUsd: number;
  spentUsd: number;
  voidedUsd: number;
  successfulReferrals: number;
  referredByUsername: string | null;
};

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getAdminReferralCreditSummary(): Promise<AdminReferralCreditSummary> {
  const [grouped, attributedUsers] = await Promise.all([
    prisma.referralCredit.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { amountUsd: true },
    }),
    prisma.user.count({ where: { referredById: { not: null } } }),
  ]);

  const byStatusMap = new Map(
    grouped.map((g) => [
      g.status,
      { status: g.status, count: g._count._all, amountUsd: roundUsd(g._sum.amountUsd ?? 0) },
    ]),
  );
  const byStatus = ALL_STATUSES.map(
    (status) => byStatusMap.get(status) ?? { status, count: 0, amountUsd: 0 },
  );

  const amount = (status: ReferralCreditStatus) => byStatusMap.get(status)?.amountUsd ?? 0;
  const outstanding =
    amount(ReferralCreditStatus.pending) +
    amount(ReferralCreditStatus.available) +
    amount(ReferralCreditStatus.reserved);

  return {
    byStatus,
    totalGrantedUsd: roundUsd(byStatus.reduce((s, r) => s + r.amountUsd, 0)),
    totalOutstandingUsd: roundUsd(outstanding),
    totalSpentUsd: amount(ReferralCreditStatus.spent),
    totalVoidedUsd: amount(ReferralCreditStatus.voided),
    attributedUsers,
  };
}

export async function listAdminReferralCredits(opts: {
  status?: ReferralCreditStatus | "all";
  q?: string;
  limit?: number;
}): Promise<AdminReferralCreditRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 300);
  const status = opts.status && opts.status !== "all" ? opts.status : undefined;
  const q = opts.q?.trim() ?? "";

  const rows = await prisma.referralCredit.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { user: { username: { contains: q, mode: "insensitive" } } },
              { user: { email: { contains: q, mode: "insensitive" } } },
              { user: { referralCode: { contains: q, mode: "insensitive" } } },
              { sourceOrderId: { contains: q, mode: "insensitive" } },
              { spentOrderId: { contains: q, mode: "insensitive" } },
              { id: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      role: true,
      amountUsd: true,
      availableAt: true,
      createdAt: true,
      voidReason: true,
      voidedAt: true,
      reservedForRef: true,
      spentAt: true,
      spentOrderId: true,
      user: { select: { id: true, username: true, email: true, referralCode: true } },
      sourceOrder: {
        select: {
          id: true,
          totalUsd: true,
          paymentStatus: true,
          buyer: { select: { id: true, username: true } },
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    role: r.role,
    amountUsd: r.amountUsd,
    availableAt: r.availableAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    voidReason: r.voidReason,
    voidedAt: r.voidedAt?.toISOString() ?? null,
    reservedForRef: r.reservedForRef,
    spentAt: r.spentAt?.toISOString() ?? null,
    spentOrderId: r.spentOrderId,
    user: r.user,
    sourceOrder: r.sourceOrder,
  }));
}

export async function listAdminReferralWallets(opts: {
  q?: string;
  limit?: number;
}): Promise<AdminReferralWalletRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const q = opts.q?.trim() ?? "";

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { referralCredits: { some: {} } },
        { referredById: { not: null } },
        { referrals: { some: {} } },
      ],
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { username: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                  { referralCode: { contains: q, mode: "insensitive" } },
                ],
              },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      username: true,
      email: true,
      referralCode: true,
      referredBy: { select: { username: true } },
      referralCredits: { select: { status: true, amountUsd: true, role: true } },
    },
    take: limit * 3,
    orderBy: { createdAt: "desc" },
  });

  const wallets: AdminReferralWalletRow[] = users.map((u) => {
    let availableUsd = 0;
    let pendingUsd = 0;
    let reservedUsd = 0;
    let spentUsd = 0;
    let voidedUsd = 0;
    let successfulReferrals = 0;
    for (const c of u.referralCredits) {
      if (c.status === ReferralCreditStatus.available) availableUsd += c.amountUsd;
      else if (c.status === ReferralCreditStatus.pending) pendingUsd += c.amountUsd;
      else if (c.status === ReferralCreditStatus.reserved) reservedUsd += c.amountUsd;
      else if (c.status === ReferralCreditStatus.spent) spentUsd += c.amountUsd;
      else if (c.status === ReferralCreditStatus.voided) voidedUsd += c.amountUsd;
      if (c.role === ReferralCreditRole.referrer && c.status !== ReferralCreditStatus.voided) {
        successfulReferrals += 1;
      }
    }
    return {
      userId: u.id,
      username: u.username,
      email: u.email,
      referralCode: u.referralCode,
      availableUsd: roundUsd(availableUsd),
      pendingUsd: roundUsd(pendingUsd),
      reservedUsd: roundUsd(reservedUsd),
      spentUsd: roundUsd(spentUsd),
      voidedUsd: roundUsd(voidedUsd),
      successfulReferrals,
      referredByUsername: u.referredBy?.username ?? null,
    };
  });

  wallets.sort(
    (a, b) =>
      b.availableUsd + b.pendingUsd + b.reservedUsd - (a.availableUsd + a.pendingUsd + a.reservedUsd) ||
      b.successfulReferrals - a.successfulReferrals,
  );
  return wallets.slice(0, limit);
}

export async function getAdminUserReferralSnapshot(userId: string): Promise<{
  referralCode: string | null;
  referredBy: { id: string; username: string } | null;
  referredAt: string | null;
  availableUsd: number;
  pendingUsd: number;
  reservedUsd: number;
  spentUsd: number;
  voidedUsd: number;
  successfulReferrals: number;
  referredUserCount: number;
  credits: AdminReferralCreditRow[];
}> {
  const [user, creditRows, referredUserCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        referralCode: true,
        referredAt: true,
        referredBy: { select: { id: true, username: true } },
      },
    }),
    prisma.referralCredit.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        role: true,
        amountUsd: true,
        availableAt: true,
        createdAt: true,
        voidReason: true,
        voidedAt: true,
        reservedForRef: true,
        spentAt: true,
        spentOrderId: true,
        user: { select: { id: true, username: true, email: true, referralCode: true } },
        sourceOrder: {
          select: {
            id: true,
            totalUsd: true,
            paymentStatus: true,
            buyer: { select: { id: true, username: true } },
          },
        },
      },
    }),
    prisma.user.count({ where: { referredById: userId } }),
  ]);

  const credits: AdminReferralCreditRow[] = creditRows.map((r) => ({
    id: r.id,
    status: r.status,
    role: r.role,
    amountUsd: r.amountUsd,
    availableAt: r.availableAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    voidReason: r.voidReason,
    voidedAt: r.voidedAt?.toISOString() ?? null,
    reservedForRef: r.reservedForRef,
    spentAt: r.spentAt?.toISOString() ?? null,
    spentOrderId: r.spentOrderId,
    user: r.user,
    sourceOrder: r.sourceOrder,
  }));

  let availableUsd = 0;
  let pendingUsd = 0;
  let reservedUsd = 0;
  let spentUsd = 0;
  let voidedUsd = 0;
  let successfulReferrals = 0;
  for (const c of credits) {
    if (c.status === ReferralCreditStatus.available) availableUsd += c.amountUsd;
    else if (c.status === ReferralCreditStatus.pending) pendingUsd += c.amountUsd;
    else if (c.status === ReferralCreditStatus.reserved) reservedUsd += c.amountUsd;
    else if (c.status === ReferralCreditStatus.spent) spentUsd += c.amountUsd;
    else if (c.status === ReferralCreditStatus.voided) voidedUsd += c.amountUsd;
    if (c.role === ReferralCreditRole.referrer && c.status !== ReferralCreditStatus.voided) {
      successfulReferrals += 1;
    }
  }

  return {
    referralCode: user?.referralCode ?? null,
    referredBy: user?.referredBy ?? null,
    referredAt: user?.referredAt?.toISOString() ?? null,
    availableUsd: roundUsd(availableUsd),
    pendingUsd: roundUsd(pendingUsd),
    reservedUsd: roundUsd(reservedUsd),
    spentUsd: roundUsd(spentUsd),
    voidedUsd: roundUsd(voidedUsd),
    successfulReferrals,
    referredUserCount,
    credits,
  };
}
