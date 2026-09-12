import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { prisma } from "@/lib/prisma";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

/**
 * Prisma `User.id` may be a cuid (legacy email account) while Supabase `profiles.id`
 * is always the Auth UUID. Resolve the Auth id before reading/writing profiles.
 */
export async function resolveSupabaseAuthUserId(
  admin: SupabaseAdmin,
  prismaUserId: string,
  opts?: { email?: string | null; username?: string | null },
): Promise<string | null> {
  const { data: byId } = await admin.from("profiles").select("id").eq("id", prismaUserId).maybeSingle();
  if (byId && typeof byId.id === "string" && byId.id.trim()) return byId.id;

  if (UUID_RE.test(prismaUserId)) {
    const { data, error } = await admin.auth.admin.getUserById(prismaUserId);
    if (!error && data.user?.id) return data.user.id;
  }

  const username = opts?.username?.trim();
  if (username) {
    const { data: byUsername } = await admin
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (byUsername && typeof byUsername.id === "string" && byUsername.id.trim()) {
      return byUsername.id;
    }
  }

  const emailNorm = opts?.email?.trim().toLowerCase();
  if (emailNorm) {
    const authId = await findAuthUserIdByEmail(emailNorm);
    if (authId) return authId;
  }

  return null;
}

/** GoTrue admin list supports email lookup via query string (not exposed on this JS client). */
async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;

  try {
    const endpoint = new URL("/auth/v1/admin/users", url.replace(/\/$/, ""));
    endpoint.searchParams.set("page", "1");
    endpoint.searchParams.set("per_page", "50");
    // GoTrue filters by email substring when `email` is provided.
    endpoint.searchParams.set("email", email);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const body = (await res.json()) as { users?: Array<{ id?: string; email?: string | null }> };
    const match = (body.users ?? []).find((u) => (u.email ?? "").trim().toLowerCase() === email);
    return match?.id?.trim() || null;
  } catch {
    return null;
  }
}

async function readSupabaseAvatarUrl(admin: SupabaseAdmin, authUserId: string): Promise<string | null> {
  const { data: profile } = await admin
    .from("profiles")
    .select("avatar_url")
    .eq("id", authUserId)
    .maybeSingle();
  if (typeof profile?.avatar_url === "string" && profile.avatar_url.trim()) {
    return profile.avatar_url.trim().slice(0, 2048);
  }

  const { data: authData, error } = await admin.auth.admin.getUserById(authUserId);
  if (error || !authData.user) return null;
  const meta = authData.user.user_metadata as Record<string, unknown> | undefined;
  if (typeof meta?.avatar_url === "string" && meta.avatar_url.trim()) {
    return meta.avatar_url.trim().slice(0, 2048);
  }
  return null;
}

/** Keep Supabase `profiles.avatar_url` in sync with Prisma `User.image` for cross-device + live chat. */
export async function syncSupabaseProfileAvatar(userId: string, avatarUrl: string | null): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.warn("[syncSupabaseProfileAvatar] Supabase admin not configured — avatar saved to app DB only.");
    return;
  }

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, username: true },
  });
  const authId = await resolveSupabaseAuthUserId(admin, userId, {
    email: row?.email,
    username: row?.username,
  });
  if (!authId) {
    console.warn("[syncSupabaseProfileAvatar] could not resolve Supabase auth id for user", { userId });
    return;
  }

  const { error } = await admin.from("profiles").update({ avatar_url: avatarUrl }).eq("id", authId);
  if (error) {
    console.error("[syncSupabaseProfileAvatar] profiles update failed", error.message);
  }

  const { error: authError } = await admin.auth.admin.updateUserById(authId, {
    user_metadata: { avatar_url: avatarUrl },
  });
  if (authError) {
    console.error("[syncSupabaseProfileAvatar] auth metadata update failed", authError.message);
  }
}

/**
 * If Prisma `User.image` is empty, copy avatar from Supabase (mobile uploads) into Prisma
 * so web session / seller pages can show it.
 */
export async function ensurePrismaAvatarFromSupabase(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true, email: true, username: true },
  });
  if (!row) return null;

  const existing = row.image?.trim() || null;
  if (existing) return existing;

  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const authId = await resolveSupabaseAuthUserId(admin, userId, {
    email: row.email,
    username: row.username,
  });
  if (!authId) return null;

  const avatarUrl = await readSupabaseAvatarUrl(admin, authId);
  if (!avatarUrl) return null;

  await prisma.user.update({
    where: { id: userId },
    data: { image: avatarUrl },
  });
  return avatarUrl;
}
