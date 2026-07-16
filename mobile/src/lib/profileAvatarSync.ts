import { fetchSellerAccount, patchSellerProfile } from '../api/sellerAccountRepository';
import { updateMyProfile } from '../api/profilesRepository';
import { getSupabase } from './supabase';

async function resolveAccessToken(explicit?: string | null): Promise<string | null> {
  const fromArgs = explicit?.trim();
  if (fromArgs) return fromArgs;
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.access_token?.trim() || null;
  } catch {
    return null;
  }
}

async function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Write avatar URL to Supabase profile + auth metadata + web account (Prisma User.image). */
export async function persistProfileAvatarEverywhere(args: {
  userId: string;
  accessToken?: string | null;
  publicUrl: string;
}): Promise<void> {
  // Bound every secondary write — any one hung Supabase/auth call used to spin profile edit forever.
  const profileWrite = withDeadline(
    updateMyProfile(args.userId, { avatar_url: args.publicUrl }),
    8_000,
    'profile avatar_url',
  ).catch((e) => {
    console.warn('[persistProfileAvatarEverywhere] profiles update failed', e);
  });

  const sb = getSupabase();
  const authWrite = sb
    ? withDeadline(
        sb.auth.updateUser({ data: { avatar_url: args.publicUrl } }).then(({ error }) => {
          if (error) throw error;
        }),
        8_000,
        'auth avatar metadata',
      ).catch((e) => {
        console.warn('[persistProfileAvatarEverywhere] auth metadata update failed', e);
      })
    : Promise.resolve();

  const token = await resolveAccessToken(args.accessToken);
  const webWrite = token
    ? withDeadline(patchSellerProfile(token, { image: args.publicUrl }), 8_000, 'web profile image').catch(
        (e) => {
          console.warn('[persistProfileAvatarEverywhere] web profile sync failed', e);
        },
      )
    : Promise.resolve().then(() => {
        console.warn('[persistProfileAvatarEverywhere] no access token — skipped web User.image sync');
      });

  await Promise.all([profileWrite, authWrite, webWrite]);
}

/** Merge avatar from Supabase + web account so older uploads show on every device. */
export async function resolveCanonicalProfileAvatar(args: {
  userId: string;
  accessToken?: string | null;
  supabaseAvatarUrl?: string | null;
}): Promise<string | null> {
  const fromSupabase = args.supabaseAvatarUrl?.trim() || null;
  const token = await resolveAccessToken(args.accessToken);

  if (fromSupabase) {
    if (token) {
      try {
        await withDeadline(patchSellerProfile(token, { image: fromSupabase }), 8_000, 'web avatar hydrate');
      } catch {
        /* web sync best-effort */
      }
    }
    return fromSupabase;
  }

  if (!token) return null;

  try {
    const acct = await withDeadline(fetchSellerAccount(token), 8_000, 'fetch seller account');
    const fromWeb = acct.seller.image?.trim() || null;
    if (!fromWeb) return null;
    await withDeadline(updateMyProfile(args.userId, { avatar_url: fromWeb }), 8_000, 'profile from web');
    const client = getSupabase();
    if (client) {
      await withDeadline(
        client.auth.updateUser({ data: { avatar_url: fromWeb } }).then(({ error }) => {
          if (error) throw error;
        }),
        8_000,
        'auth from web',
      ).catch(() => undefined);
    }
    return fromWeb;
  } catch {
    return null;
  }
}
