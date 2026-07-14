import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import {
  extractSupabaseAuthEmail,
  placeholderEmailForSupabaseUser,
} from "@/lib/extract-supabase-auth-email";
import { prisma } from "@/lib/prisma";
import { pickPrismaUserIdForSupabaseSession } from "@/lib/pick-prisma-user-for-supabase-auth";
import { attributeReferralOnSignup } from "@/lib/referral-credit";
import { allocateUniqueReferralCode } from "@/lib/referral-code";
import { syncPrismaEmailVerifiedFromSupabase } from "@/lib/sync-prisma-email-verified";
import { isUsernameTakenCaseInsensitive } from "@/lib/username-db";
import { evaluateUsernamePolicy, normalizeUsernameForStorage } from "@/lib/username-policy";

function baseUsernameFromSupabaseUser(user: SupabaseAuthUser): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const raw = typeof meta?.username === "string" ? meta.username.trim().toLowerCase() : "";
  if (raw && /^[a-zA-Z0-9_]{3,20}$/.test(raw)) return raw.slice(0, 20);
  const local = user.email?.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() ?? "";
  const cleaned = local.replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (cleaned.length >= 3) return cleaned.slice(0, 20);
  return `user_${user.id.replace(/-/g, "").slice(0, 12)}`;
}

function metaChosenUsername(meta: Record<string, unknown> | undefined): string | null {
  const raw = typeof meta?.username === "string" ? meta.username.trim() : "";
  if (!raw) return null;
  const normalized = normalizeUsernameForStorage(raw);
  const policy = evaluateUsernamePolicy(normalized);
  if (!policy.ok) return null;
  return normalized;
}

async function allocateUsername(base: string): Promise<string> {
  const sanitized = base.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "user";
  const stem = sanitized.slice(0, 17);
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? stem.slice(0, 20) : `${stem}_${i}`.slice(0, 20);
    if (candidate.length < 3) continue;
    const taken = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `u_${Date.now()}`.slice(0, 20);
}

async function resolveInitialUsername(
  supabaseUser: SupabaseAuthUser,
): Promise<{ username: string; usernameChosenAt: Date | null }> {
  const meta = supabaseUser.user_metadata as Record<string, unknown> | undefined;
  const chosen = metaChosenUsername(meta);
  if (chosen) {
    const taken = await isUsernameTakenCaseInsensitive(prisma, chosen);
    const username = taken ? await allocateUsername(chosen) : chosen;
    return { username, usernameChosenAt: new Date() };
  }
  return {
    username: await allocateUsername(baseUsernameFromSupabaseUser(supabaseUser)),
    usernameChosenAt: null,
  };
}

/**
 * Maps a Supabase Auth user to a Prisma `User.id` for APIs that persist on `User` (Stripe Connect, etc.).
 *
 * - If a row already exists with `id === supabaseUser.id`, returns it.
 * - Else if a row exists with the same email (e.g. NextAuth credentials user), returns that id.
 * - Else creates a minimal `User` with `id = supabaseUser.id` so mobile sessions stay aligned.
 */
export async function ensurePrismaUserForSupabaseAuth(supabaseUser: SupabaseAuthUser): Promise<string | null> {
  const meta = supabaseUser.user_metadata as Record<string, unknown> | undefined;
  const email =
    extractSupabaseAuthEmail(supabaseUser) ?? placeholderEmailForSupabaseUser(supabaseUser.id);

  const stripePickSelect = {
    id: true,
    stripeAccountId: true,
    stripeOnboardingComplete: true,
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
  } as const;

  const byId = await prisma.user.findUnique({
    where: { id: supabaseUser.id },
    select: stripePickSelect,
  });

  const byEmail = email
    ? await prisma.user.findUnique({
        where: { email },
        select: stripePickSelect,
      })
    : null;

  const picked = pickPrismaUserIdForSupabaseSession({
    supabaseUserId: supabaseUser.id,
    byId,
    byEmail,
  });
  if (picked) {
    await syncPrismaEmailVerifiedFromSupabase(picked, supabaseUser);
    return picked;
  }

  const { username, usernameChosenAt } = await resolveInitialUsername(supabaseUser);
  const displayRaw = meta?.display_name;
  const display =
    typeof displayRaw === "string" && displayRaw.trim() ? displayRaw.trim().slice(0, 120) : null;

  const emailVerifiedAt = supabaseUser.email_confirmed_at
    ? new Date(supabaseUser.email_confirmed_at)
    : new Date();

  try {
    const ownReferralCode = await allocateUniqueReferralCode();
    const created = await prisma.user.create({
      data: {
        id: supabaseUser.id,
        email,
        username,
        usernameChosenAt,
        name: display,
        emailVerified: emailVerifiedAt,
        referralCode: ownReferralCode,
      },
    });
    const referralCode = typeof meta?.referral_code === "string" ? meta.referral_code : null;
    if (referralCode) {
      await attributeReferralOnSignup(created.id, referralCode);
    }
    const { scheduleNotifyAdmins } = await import("@/lib/admin/notify-admins");
    scheduleNotifyAdmins({
      type: "admin_new_user",
      title: "New account created",
      body: `@${username} (${email}) just signed up.`,
      href: "/admin/users",
      dedupeKey: `new-user:${created.id}`,
    });
    return created.id;
  } catch {
    const byEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (byEmail) return byEmail.id;
    const byId = await prisma.user.findUnique({ where: { id: supabaseUser.id }, select: { id: true } });
    return byId?.id ?? null;
  }
}
