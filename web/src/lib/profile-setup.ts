import { prisma } from "@/lib/prisma";
import { attributeReferralOnSignup } from "@/lib/referral-credit";
import { syncSupabaseProfileUsername } from "@/lib/sync-profile-username";
import {
  getUsernameChangeEligibility,
  usernameChangeBlockMessage,
} from "@/lib/username-change-policy";
import { isUsernameTakenByOtherUser } from "@/lib/username-db";
import {
  canAdminClaimReservedUsername,
  evaluateUsernamePolicy,
  normalizeUsernameForStorage,
  USERNAME_UNAVAILABLE_MESSAGE,
} from "@/lib/username-policy";

export type ProfileSetupStatus = {
  needsSetup: boolean;
  username: string;
  referralAlreadySet: boolean;
};

export async function getProfileSetupStatus(userId: string): Promise<ProfileSetupStatus | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, usernameChosenAt: true, referredById: true },
  });
  if (!user) return null;
  return {
    needsSetup: user.usernameChosenAt == null,
    username: user.username,
    referralAlreadySet: user.referredById != null,
  };
}

function validateUsernameInput(
  raw: unknown,
  opts?: { userRole?: string },
): { ok: true; normalized: string } | { ok: false; message: string } {
  if (typeof raw !== "string") {
    return { ok: false, message: "Enter a username." };
  }
  const normalized = normalizeUsernameForStorage(raw);
  const policy = evaluateUsernamePolicy(normalized, { userRole: opts?.userRole });
  if (!policy.ok) {
    return { ok: false, message: USERNAME_UNAVAILABLE_MESSAGE };
  }
  return { ok: true, normalized };
}

export async function completeProfileSetup(args: {
  userId: string;
  username: unknown;
  referralCode?: unknown;
}): Promise<{ ok: true; username: string; usernameChosenAt: string } | { ok: false; status: number; message: string }> {
  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { username: true, usernameChosenAt: true, referredById: true },
  });
  if (!user) {
    return { ok: false, status: 404, message: "Account not found." };
  }
  if (user.usernameChosenAt != null) {
    return { ok: false, status: 409, message: "Your profile is already set up." };
  }

  const parsed = validateUsernameInput(args.username);
  if (!parsed.ok) {
    return { ok: false, status: 400, message: parsed.message };
  }

  const taken = await isUsernameTakenByOtherUser(prisma, parsed.normalized, args.userId);
  if (taken) {
    return { ok: false, status: 409, message: USERNAME_UNAVAILABLE_MESSAGE };
  }

  const now = new Date();
  const updated = await prisma.user.update({
    where: { id: args.userId },
    data: { username: parsed.normalized, usernameChosenAt: now },
    select: { username: true, usernameChosenAt: true },
  });

  await syncSupabaseProfileUsername(args.userId, updated.username);

  if (!user.referredById && typeof args.referralCode === "string" && args.referralCode.trim()) {
    await attributeReferralOnSignup(args.userId, args.referralCode);
  }

  return {
    ok: true,
    username: updated.username,
    usernameChosenAt: updated.usernameChosenAt!.toISOString(),
  };
}

export async function changeUsername(args: {
  userId: string;
  username: unknown;
}): Promise<{ ok: true; username: string; usernameChosenAt: string } | { ok: false; status: number; message: string }> {
  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { username: true, usernameChosenAt: true, role: true },
  });
  if (!user) {
    return { ok: false, status: 404, message: "Account not found." };
  }
  if (user.usernameChosenAt == null) {
    return { ok: false, status: 409, message: "Finish profile setup before changing your username." };
  }

  const parsed = validateUsernameInput(args.username, { userRole: user.role });
  if (!parsed.ok) {
    return { ok: false, status: 400, message: parsed.message };
  }

  if (parsed.normalized === user.username) {
    return {
      ok: true,
      username: user.username,
      usernameChosenAt: user.usernameChosenAt.toISOString(),
    };
  }

  const eligibility = await getUsernameChangeEligibility({
    userId: args.userId,
    usernameChosenAt: user.usernameChosenAt,
  });
  const adminOfficialClaim = canAdminClaimReservedUsername(user.role, parsed.normalized);
  if (!eligibility.canChange && eligibility.reason && !adminOfficialClaim) {
    return { ok: false, status: 403, message: usernameChangeBlockMessage(eligibility.reason) };
  }

  const taken = await isUsernameTakenByOtherUser(prisma, parsed.normalized, args.userId);
  if (taken) {
    return { ok: false, status: 409, message: USERNAME_UNAVAILABLE_MESSAGE };
  }

  const now = new Date();
  const updated = await prisma.user.update({
    where: { id: args.userId },
    data: { username: parsed.normalized, usernameChosenAt: now },
    select: { username: true, usernameChosenAt: true },
  });

  await syncSupabaseProfileUsername(args.userId, updated.username);

  return {
    ok: true,
    username: updated.username,
    usernameChosenAt: updated.usernameChosenAt!.toISOString(),
  };
}
