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

/** Write avatar URL to Supabase profile + auth metadata + web account (Prisma User.image). */
export async function persistProfileAvatarEverywhere(args: {
  userId: string;
  accessToken?: string | null;
  publicUrl: string;
}): Promise<void> {
  await updateMyProfile(args.userId, { avatar_url: args.publicUrl });

  const sb = getSupabase();
  if (sb) {
    await sb.auth.updateUser({ data: { avatar_url: args.publicUrl } });
  }

  const token = await resolveAccessToken(args.accessToken);
  if (token) {
    try {
      await patchSellerProfile(token, { image: args.publicUrl });
    } catch (e) {
      console.warn('[persistProfileAvatarEverywhere] web profile sync failed', e);
    }
  } else {
    console.warn('[persistProfileAvatarEverywhere] no access token — skipped web User.image sync');
  }
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
        await patchSellerProfile(token, { image: fromSupabase });
      } catch {
        /* web sync best-effort */
      }
    }
    return fromSupabase;
  }

  if (!token) return null;

  try {
    const acct = await fetchSellerAccount(token);
    const fromWeb = acct.seller.image?.trim() || null;
    if (!fromWeb) return null;
    await updateMyProfile(args.userId, { avatar_url: fromWeb });
    const client = getSupabase();
    if (client) {
      await client.auth.updateUser({ data: { avatar_url: fromWeb } });
    }
    return fromWeb;
  } catch {
    return null;
  }
}
