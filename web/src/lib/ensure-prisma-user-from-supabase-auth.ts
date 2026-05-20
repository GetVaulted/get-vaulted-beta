import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { pickPrismaUserIdForSupabaseSession } from "@/lib/pick-prisma-user-for-supabase-auth";

function normalizeEmail(email: string | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e ? e : null;
}

function baseUsernameFromSupabaseUser(user: SupabaseAuthUser): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const raw = typeof meta?.username === "string" ? meta.username.trim().toLowerCase() : "";
  if (raw && /^[a-zA-Z0-9_]{3,20}$/.test(raw)) return raw.slice(0, 20);
  const local = user.email?.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() ?? "";
  const cleaned = local.replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (cleaned.length >= 3) return cleaned.slice(0, 20);
  return `user_${user.id.replace(/-/g, "").slice(0, 12)}`;
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

/**
 * Maps a Supabase Auth user to a Prisma `User.id` for APIs that persist on `User` (Stripe Connect, etc.).
 *
 * - If a row already exists with `id === supabaseUser.id`, returns it.
 * - Else if a row exists with the same email (e.g. NextAuth credentials user), returns that id.
 * - Else creates a minimal `User` with `id = supabaseUser.id` so mobile sessions stay aligned.
 */
export async function ensurePrismaUserForSupabaseAuth(supabaseUser: SupabaseAuthUser): Promise<string | null> {
  const email = normalizeEmail(supabaseUser.email ?? undefined);

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
  if (picked) return picked;

  if (!email) return null;

  const username = await allocateUsername(baseUsernameFromSupabaseUser(supabaseUser));
  const meta = supabaseUser.user_metadata as Record<string, unknown> | undefined;
  const displayRaw = meta?.display_name;
  const display =
    typeof displayRaw === "string" && displayRaw.trim() ? displayRaw.trim().slice(0, 120) : null;

  const emailVerifiedAt = supabaseUser.email_confirmed_at
    ? new Date(supabaseUser.email_confirmed_at)
    : new Date();

  try {
    const created = await prisma.user.create({
      data: {
        id: supabaseUser.id,
        email,
        username,
        name: display,
        emailVerified: emailVerifiedAt,
      },
    });
    return created.id;
  } catch {
    const byEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (byEmail) return byEmail.id;
    const byId = await prisma.user.findUnique({ where: { id: supabaseUser.id }, select: { id: true } });
    return byId?.id ?? null;
  }
}
