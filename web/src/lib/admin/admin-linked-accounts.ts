import { prisma } from "@/lib/prisma";
import {
  normalizeAddressKey,
  normalizeEmailForComparison,
  normalizePhoneDigits,
} from "@/lib/identity-normalize";

export type LinkedAccountSignalKind =
  | "stripe_customer"
  | "stripe_connect"
  | "payment_method"
  | "push_token"
  | "email_alias"
  | "ship_address"
  | "address_phone";

export type LinkedAccountSignal = {
  kind: LinkedAccountSignalKind;
  label: string;
  evidence: string;
  weight: number;
};

export type LinkedAccountPeer = {
  userId: string;
  username: string;
  email: string;
  suspendedAt: string | null;
  createdAt: string;
  score: number;
  signals: LinkedAccountSignal[];
};

export type LinkedAccountCluster = {
  id: string;
  score: number;
  reasonSummary: string;
  users: Array<{
    id: string;
    username: string;
    email: string;
    suspendedAt: string | null;
    createdAt: string;
  }>;
  signals: LinkedAccountSignal[];
};

const WEIGHT: Record<LinkedAccountSignalKind, number> = {
  stripe_customer: 40,
  stripe_connect: 40,
  payment_method: 35,
  push_token: 30,
  email_alias: 25,
  ship_address: 15,
  address_phone: 12,
};

function signal(kind: LinkedAccountSignalKind, evidence: string): LinkedAccountSignal {
  return {
    kind,
    label: kind.replace(/_/g, " "),
    evidence: evidence.slice(0, 120),
    weight: WEIGHT[kind],
  };
}

/** Pure helper — merge signals for the same peer and compute score. */
export function scorePeerSignals(signals: LinkedAccountSignal[]): number {
  const byKind = new Map<LinkedAccountSignalKind, LinkedAccountSignal>();
  for (const s of signals) {
    const prev = byKind.get(s.kind);
    if (!prev || s.weight > prev.weight) byKind.set(s.kind, s);
  }
  return [...byKind.values()].reduce((sum, s) => sum + s.weight, 0);
}

type UserLite = {
  id: string;
  username: string;
  email: string;
  suspendedAt: Date | null;
  createdAt: Date;
};

function toUserLite(u: UserLite) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    suspendedAt: u.suspendedAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

/**
 * Review-only: find other accounts that share strong first-party signals with `userId`.
 * Does not auto-suspend or ban.
 */
export async function findLinkedAccountsForUser(userId: string): Promise<{
  userId: string;
  peers: LinkedAccountPeer[];
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      suspendedAt: true,
      createdAt: true,
      stripeCustomerId: true,
      stripeAccountId: true,
    },
  });
  if (!user) return { userId, peers: [] };

  const signalMap = new Map<string, LinkedAccountSignal[]>();

  const add = (peerId: string, s: LinkedAccountSignal) => {
    if (!peerId || peerId === userId) return;
    const list = signalMap.get(peerId) ?? [];
    list.push(s);
    signalMap.set(peerId, list);
  };

  const [pushTokens, buyerOrders, addresses] = await Promise.all([
    prisma.pushDeviceToken.findMany({
      where: { userId },
      select: { expoPushToken: true },
      take: 20,
    }),
    prisma.order.findMany({
      where: { buyerId: userId },
      select: { shipAddress: true, shipZip: true, walletPaymentMethodId: true, processorCustomerId: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.address.findMany({
      where: { userId },
      select: { phone: true, line1: true, postalCode: true },
      take: 20,
    }),
  ]);

  if (user.stripeCustomerId) {
    const siblings = await prisma.user.findMany({
      where: { stripeCustomerId: user.stripeCustomerId, id: { not: userId } },
      select: { id: true },
      take: 25,
    });
    for (const s of siblings) {
      add(s.id, signal("stripe_customer", user.stripeCustomerId));
    }
  }

  if (user.stripeAccountId) {
    const siblings = await prisma.user.findMany({
      where: { stripeAccountId: user.stripeAccountId, id: { not: userId } },
      select: { id: true },
      take: 25,
    });
    for (const s of siblings) {
      add(s.id, signal("stripe_connect", user.stripeAccountId));
    }
  }

  const tokenValues = [...new Set(pushTokens.map((t) => t.expoPushToken).filter(Boolean))];
  if (tokenValues.length > 0) {
    const shared = await prisma.pushDeviceToken.findMany({
      where: { expoPushToken: { in: tokenValues }, userId: { not: userId } },
      select: { userId: true, expoPushToken: true },
      take: 50,
    });
    for (const row of shared) {
      add(row.userId, signal("push_token", row.expoPushToken.slice(0, 24) + "…"));
    }
  }

  const pmIds = [
    ...new Set(
      buyerOrders
        .map((o) => o.walletPaymentMethodId)
        .filter((id): id is string => Boolean(id && id.startsWith("pm_"))),
    ),
  ].slice(0, 15);
  if (pmIds.length > 0) {
    const sharedOrders = await prisma.order.findMany({
      where: { walletPaymentMethodId: { in: pmIds }, buyerId: { not: userId } },
      select: { buyerId: true, walletPaymentMethodId: true },
      take: 50,
    });
    for (const o of sharedOrders) {
      if (o.walletPaymentMethodId) {
        add(o.buyerId, signal("payment_method", o.walletPaymentMethodId));
      }
    }
  }

  const emailKey = normalizeEmailForComparison(user.email);
  if (emailKey.includes("@")) {
    const domain = emailKey.slice(emailKey.indexOf("@"));
    const candidates = await prisma.user.findMany({
      where: {
        id: { not: userId },
        email: { endsWith: domain, mode: "insensitive" },
      },
      select: { id: true, email: true },
      take: 250,
    });
    for (const c of candidates) {
      if (normalizeEmailForComparison(c.email) === emailKey) {
        add(c.id, signal("email_alias", `${user.email} ≈ ${c.email}`));
      }
    }
  }

  const addressKeys = new Set<string>();
  for (const o of buyerOrders) {
    if (o.shipAddress && o.shipZip) addressKeys.add(normalizeAddressKey(o.shipAddress, o.shipZip));
  }
  for (const a of addresses) {
    if (a.line1 && a.postalCode) addressKeys.add(normalizeAddressKey(a.line1, a.postalCode));
  }
  const phoneKeys = new Set(
    addresses
      .map((a) => (a.phone ? normalizePhoneDigits(a.phone) : ""))
      .filter((p) => p.length >= 10),
  );

  const zips = [...new Set([...addressKeys].map((k) => k.split("|")[1]).filter(Boolean))].slice(0, 15);
  if (zips.length > 0) {
    const byZip = await prisma.order.findMany({
      where: { buyerId: { not: userId }, shipZip: { in: zips } },
      select: { buyerId: true, shipAddress: true, shipZip: true },
      take: 300,
      orderBy: { createdAt: "desc" },
    });
    for (const o of byZip) {
      const key = normalizeAddressKey(o.shipAddress, o.shipZip);
      if (addressKeys.has(key)) {
        add(o.buyerId, signal("ship_address", key));
      }
    }
  }

  if (phoneKeys.size > 0) {
    const otherAddresses = await prisma.address.findMany({
      where: { userId: { not: userId }, phone: { not: null } },
      select: { userId: true, phone: true },
      take: 500,
    });
    for (const a of otherAddresses) {
      if (!a.phone) continue;
      const digits = normalizePhoneDigits(a.phone);
      if (phoneKeys.has(digits)) {
        add(a.userId, signal("address_phone", digits));
      }
    }
  }

  const peerIds = [...signalMap.keys()];
  if (peerIds.length === 0) return { userId, peers: [] };

  const peersUsers = await prisma.user.findMany({
    where: { id: { in: peerIds } },
    select: { id: true, username: true, email: true, suspendedAt: true, createdAt: true },
  });
  const byId = new Map(peersUsers.map((u) => [u.id, u]));

  const peers: LinkedAccountPeer[] = [];
  for (const [peerId, signals] of signalMap) {
    const u = byId.get(peerId);
    if (!u) continue;
    const dedupedKinds = new Map<LinkedAccountSignalKind, LinkedAccountSignal>();
    for (const s of signals) {
      if (!dedupedKinds.has(s.kind)) dedupedKinds.set(s.kind, s);
    }
    const uniqueSignals = [...dedupedKinds.values()];
    peers.push({
      userId: u.id,
      username: u.username,
      email: u.email,
      suspendedAt: u.suspendedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      score: scorePeerSignals(uniqueSignals),
      signals: uniqueSignals,
    });
  }

  peers.sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
  return { userId, peers: peers.slice(0, 40) };
}

/**
 * Platform-wide review queue: clusters of accounts sharing strong signals.
 * Bounded scans — review-only.
 */
export async function listLinkedAccountClusters(opts?: {
  limit?: number;
}): Promise<{ clusters: LinkedAccountCluster[]; scannedAt: string }> {
  const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 100);
  const clusters: LinkedAccountCluster[] = [];

  const stripeCustomers = await prisma.user.groupBy({
    by: ["stripeCustomerId"],
    where: { stripeCustomerId: { not: null }, accountDeletedAt: null },
    _count: { _all: true },
    having: { stripeCustomerId: { _count: { gt: 1 } } },
    orderBy: { _count: { stripeCustomerId: "desc" } },
    take: 25,
  });

  for (const row of stripeCustomers) {
    if (!row.stripeCustomerId) continue;
    const users = await prisma.user.findMany({
      where: { stripeCustomerId: row.stripeCustomerId },
      select: { id: true, username: true, email: true, suspendedAt: true, createdAt: true },
      take: 15,
    });
    if (users.length < 2) continue;
    const sig = [signal("stripe_customer", row.stripeCustomerId)];
    clusters.push({
      id: `cus_${row.stripeCustomerId}`,
      score: WEIGHT.stripe_customer * (users.length - 1),
      reasonSummary: `Shared Stripe customer (${users.length} accounts)`,
      users: users.map(toUserLite),
      signals: sig,
    });
  }

  const stripeAccounts = await prisma.user.groupBy({
    by: ["stripeAccountId"],
    where: { stripeAccountId: { not: null }, accountDeletedAt: null },
    _count: { _all: true },
    having: { stripeAccountId: { _count: { gt: 1 } } },
    orderBy: { _count: { stripeAccountId: "desc" } },
    take: 25,
  });

  for (const row of stripeAccounts) {
    if (!row.stripeAccountId) continue;
    const users = await prisma.user.findMany({
      where: { stripeAccountId: row.stripeAccountId },
      select: { id: true, username: true, email: true, suspendedAt: true, createdAt: true },
      take: 15,
    });
    if (users.length < 2) continue;
    clusters.push({
      id: `acct_${row.stripeAccountId}`,
      score: WEIGHT.stripe_connect * (users.length - 1),
      reasonSummary: `Shared Stripe Connect account (${users.length} accounts)`,
      users: users.map(toUserLite),
      signals: [signal("stripe_connect", row.stripeAccountId)],
    });
  }

  // Push tokens shared across users — find tokens that appear more than once via raw grouping in memory
  const recentTokens = await prisma.pushDeviceToken.findMany({
    orderBy: { updatedAt: "desc" },
    take: 2000,
    select: { expoPushToken: true, userId: true },
  });
  const tokenUsers = new Map<string, Set<string>>();
  for (const t of recentTokens) {
    const set = tokenUsers.get(t.expoPushToken) ?? new Set();
    set.add(t.userId);
    tokenUsers.set(t.expoPushToken, set);
  }
  const sharedTokens = [...tokenUsers.entries()]
    .filter(([, ids]) => ids.size > 1)
    .slice(0, 25);

  for (const [token, ids] of sharedTokens) {
    const users = await prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, username: true, email: true, suspendedAt: true, createdAt: true },
    });
    if (users.length < 2) continue;
    clusters.push({
      id: `push_${token.slice(0, 24)}`,
      score: WEIGHT.push_token * (users.length - 1),
      reasonSummary: `Shared push device token (${users.length} accounts)`,
      users: users.map(toUserLite),
      signals: [signal("push_token", token.slice(0, 28) + "…")],
    });
  }

  // Payment methods shared across buyers
  const pmRows = await prisma.order.findMany({
    where: { walletPaymentMethodId: { startsWith: "pm_" } },
    select: { walletPaymentMethodId: true, buyerId: true },
    orderBy: { createdAt: "desc" },
    take: 1500,
  });
  const pmBuyers = new Map<string, Set<string>>();
  for (const row of pmRows) {
    if (!row.walletPaymentMethodId) continue;
    const set = pmBuyers.get(row.walletPaymentMethodId) ?? new Set();
    set.add(row.buyerId);
    pmBuyers.set(row.walletPaymentMethodId, set);
  }
  for (const [pm, buyers] of [...pmBuyers.entries()].filter(([, b]) => b.size > 1).slice(0, 25)) {
    const users = await prisma.user.findMany({
      where: { id: { in: [...buyers] } },
      select: { id: true, username: true, email: true, suspendedAt: true, createdAt: true },
    });
    if (users.length < 2) continue;
    clusters.push({
      id: `pm_${pm}`,
      score: WEIGHT.payment_method * (users.length - 1),
      reasonSummary: `Shared payment method (${users.length} accounts)`,
      users: users.map(toUserLite),
      signals: [signal("payment_method", pm)],
    });
  }

  // Email alias clusters among a recent user sample (bounded)
  const recentUsers = await prisma.user.findMany({
    where: { accountDeletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 1500,
    select: { id: true, username: true, email: true, suspendedAt: true, createdAt: true },
  });
  const emailGroups = new Map<string, UserLite[]>();
  for (const u of recentUsers) {
    const key = normalizeEmailForComparison(u.email);
    const list = emailGroups.get(key) ?? [];
    list.push(u);
    emailGroups.set(key, list);
  }
  for (const [key, users] of emailGroups) {
    if (users.length < 2) continue;
    clusters.push({
      id: `email_${key}`,
      score: WEIGHT.email_alias * (users.length - 1),
      reasonSummary: `Email alias match (${users.length} accounts)`,
      users: users.slice(0, 15).map(toUserLite),
      signals: [signal("email_alias", key)],
    });
  }

  // Deduplicate overlapping clusters by sorted user id set
  const seen = new Set<string>();
  const unique: LinkedAccountCluster[] = [];
  for (const c of clusters.sort((a, b) => b.score - a.score)) {
    const key = c.users
      .map((u) => u.id)
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
    if (unique.length >= limit) break;
  }

  return { clusters: unique, scannedAt: new Date().toISOString() };
}
