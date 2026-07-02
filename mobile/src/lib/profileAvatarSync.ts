import { fetchSellerAccount, patchSellerProfile } from '../api/sellerAccountRepository';
import { updateMyProfile } from '../api/profilesRepository';
import { getSupabase } from './supabase';

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

  const token = args.accessToken?.trim();
  if (token) {
    await patchSellerProfile(token, { image: args.publicUrl });
  }
}

/** Merge avatar from Supabase + web account so older uploads show on every device. */
export async function resolveCanonicalProfileAvatar(args: {
  userId: string;
  accessToken?: string | null;
  supabaseAvatarUrl?: string | null;
}): Promise<string | null> {
  const fromSupabase = args.supabaseAvatarUrl?.trim() || null;
  const token = args.accessToken?.trim();

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
    const sb = getSupabase();
    if (sb) {
      await sb.auth.updateUser({ data: { avatar_url: fromWeb } });
    }
    return fromWeb;
  } catch {
    return null;
  }
}
