import { resolveSellerShippingProfileIdForCategory } from '../lib/liveShowCategoryShippingProfile';
import type { LiveHostShippingProfileOption } from '../api/liveHostShippingRepository';
import type { CategoryId } from '../types';

export type SellerShippingProfileParcel = Pick<
  LiveHostShippingProfileOption,
  'defaultWeightOz' | 'defaultLengthIn' | 'defaultWidthIn' | 'defaultHeightIn'
>;

export function marketplaceListingCategoryForShippingProfile(
  category: CategoryId | null,
  subcategories: string[],
): string {
  const subs = subcategories.join(' ').toLowerCase();
  if (category === 'cards') {
    if (subs.includes('graded') || subs.includes('slab')) return 'graded';
    return 'cards';
  }
  if (category === 'sneakers') return 'apparel';
  if (category === 'watches' || category === 'luxury') return 'collectible';
  if (category === 'memorabilia') {
    if (subs.includes('helmet')) return subs.includes('mini') ? 'mini helmet' : 'helmets';
    if (subs.includes('jersey')) return 'jersey';
    if (subs.includes('sealed')) return 'sealed box';
    return 'memorabilia';
  }
  return category ?? 'other';
}

export function suggestMarketplaceShippingProfileId(
  profiles: readonly LiveHostShippingProfileOption[],
  category: CategoryId | null,
  subcategories: string[],
): string {
  return resolveSellerShippingProfileIdForCategory(
    profiles.map((p) => ({
      id: p.id,
      sourceSlug: p.sourceSlug ?? '',
      isDefault: p.isDefault,
    })),
    marketplaceListingCategoryForShippingProfile(category, subcategories),
  );
}

export function packageFieldsFromSellerProfile(profile: SellerShippingProfileParcel): {
  packageWeightLb: string;
  packageWeightOz: string;
  packageLengthIn: string;
  packageWidthIn: string;
  packageHeightIn: string;
} {
  const totalOz = Number(profile.defaultWeightOz);
  const safeOz = Number.isFinite(totalOz) && totalOz > 0 ? totalOz : 16;
  const wholeLb = Math.floor(safeOz / 16);
  const remainderOz = Math.round(safeOz - wholeLb * 16);

  const fmt = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return '';
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
  };

  return {
    packageWeightLb: wholeLb > 0 ? String(wholeLb) : '',
    packageWeightOz: wholeLb > 0 ? (remainderOz > 0 ? String(remainderOz) : '') : fmt(safeOz),
    packageLengthIn: fmt(Number(profile.defaultLengthIn)),
    packageWidthIn: fmt(Number(profile.defaultWidthIn)),
    packageHeightIn: fmt(Number(profile.defaultHeightIn)),
  };
}

export function formatSellerProfileParcelSummary(profile: SellerShippingProfileParcel): string {
  const totalOz = Number(profile.defaultWeightOz);
  const weight =
    Number.isFinite(totalOz) && totalOz > 0
      ? totalOz >= 16 && totalOz % 16 === 0
        ? `${totalOz / 16} lb`
        : `${totalOz} oz`
      : '—';
  const l = profile.defaultLengthIn;
  const w = profile.defaultWidthIn;
  const h = profile.defaultHeightIn;
  const dims =
    l != null && w != null && h != null && l > 0 && w > 0 && h > 0 ? `${l}×${w}×${h} in` : '—';
  return `${weight} · ${dims}`;
}
