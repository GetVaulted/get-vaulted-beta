import type { CategoryId } from '../types';

export type ListingSubcategoryGroup = {
  title: string;
  options: readonly string[];
};

export const LISTING_SUBCATEGORY_GROUPS: Record<CategoryId, readonly ListingSubcategoryGroup[]> = {
  cards: [
    {
      title: 'Sports',
      options: ['NFL', 'NBA', 'MLB', 'NHL', 'NCAA Football', 'NCAA Basketball', 'Soccer', 'F1', 'UFC', 'Other sports'],
    },
    {
      title: 'TCG & non-sport',
      options: [
        'Pokémon',
        'Magic: The Gathering',
        'Yu-Gi-Oh!',
        'One Piece',
        'Disney Lorcana',
        'Dragon Ball',
        'Other TCG',
        'Non-sport / entertainment',
      ],
    },
    {
      title: 'Product format',
      options: [
        'Single cards',
        'Lots / sets',
        'Sealed packs',
        'Booster packs',
        'Blaster boxes',
        'Hobby boxes',
        'Factory sealed',
        'Vintage wax',
        'Break spots',
      ],
    },
    {
      title: 'Grade & condition',
      options: ['Graded (PSA / BGS / SGC)', 'Raw / ungraded', 'Authenticated only', 'Rookie', 'Vintage', 'Modern'],
    },
  ],
  memorabilia: [
    {
      title: 'Sport',
      options: ['NFL', 'NBA', 'MLB', 'NHL', 'NCAA', 'Soccer', 'Golf', 'Tennis', 'Boxing / MMA', 'Other sport'],
    },
    {
      title: 'Type',
      options: [
        'Game-used',
        'Signed / autographed',
        'Jersey',
        'Helmet',
        'Ball',
        'Bat',
        'Puck',
        'Photo / print',
        'Ticket / pass',
        'Display / framed',
      ],
    },
    {
      title: 'Era',
      options: ['Vintage', 'Modern', 'Retired player', 'Active player', 'Hall of Fame'],
    },
  ],
  sneakers: [
    {
      title: 'Brand',
      options: ['Nike', 'Jordan', 'Adidas', 'New Balance', 'ASICS', 'Puma', 'Reebok', 'Other brand'],
    },
    {
      title: 'Line / style',
      options: ['Collaboration', 'Retro', 'Performance', 'Lifestyle', 'SB / skate', 'Limited release'],
    },
    {
      title: 'Condition',
      options: ['Deadstock / DS', 'VNDS', 'Pre-owned', 'Used', 'With box', 'No box', 'Replacement box'],
    },
  ],
  watches: [
    {
      title: 'Style',
      options: ['Sport', 'Dress', 'Dive', 'Pilot / aviation', 'Chronograph', 'GMT / travel', 'Digital / G-Shock'],
    },
    {
      title: 'Era',
      options: ['Vintage', 'Modern', 'Limited edition', 'Independent / microbrand'],
    },
    {
      title: 'Included',
      options: ['Full set (box & papers)', 'Box only', 'Papers only', 'Watch only', 'Aftermarket parts noted'],
    },
  ],
  luxury: [
    {
      title: 'Category',
      options: [
        'Handbags & bags',
        'Jewelry',
        'Accessories',
        'Apparel & ready-to-wear',
        'Footwear',
        'Small leather goods',
        'Fragrances & beauty',
        'Eyewear',
      ],
    },
    {
      title: 'Brand tier',
      options: ['Contemporary', 'Designer', 'Haute couture', 'Streetwear luxury'],
    },
    {
      title: 'Condition',
      options: ['New / unused', 'Like new', 'Excellent', 'Good', 'With authenticity card', 'Receipt available'],
    },
  ],
  other: [
    {
      title: 'Electronics & tech',
      options: [
        'Phones & tablets',
        'Computers & laptops',
        'Gaming consoles',
        'PC & gaming gear',
        'Audio & headphones',
        'Cameras & film',
        'Smart home',
        'Wearables & gadgets',
        'Vintage electronics',
        'Other electronics',
      ],
    },
    {
      title: 'Collectibles & hobbies',
      options: [
        'Art & prints',
        'Coins & currency',
        'Stamps',
        'Comics (non-sport)',
        'Toys & figures',
        'Books & media',
        'Music memorabilia',
        'Vintage & antique',
        'Other collectibles',
      ],
    },
    {
      title: 'Everything else',
      options: [
        'Home & kitchen',
        'Tools & equipment',
        'Fashion (general)',
        'Beauty & personal care',
        'Sports equipment',
        'Automotive & parts',
        'Pet supplies',
        'Office & supplies',
        'Mixed lot / variety',
        'Not listed above',
      ],
    },
  ],
};

export function getSubcategoryGroups(category: CategoryId): readonly ListingSubcategoryGroup[] {
  return LISTING_SUBCATEGORY_GROUPS[category] ?? [];
}

export function allSubcategoryOptions(category: CategoryId): string[] {
  return getSubcategoryGroups(category).flatMap((g) => [...g.options]);
}

/** Drops sub-tags that are not valid for the current main category (e.g. legacy "Watches" under Luxury). */
export function sanitizeSubcategoriesForCategory(category: CategoryId, selected: string[]): string[] {
  const valid = new Set(allSubcategoryOptions(category));
  return selected.filter((s) => valid.has(s));
}
