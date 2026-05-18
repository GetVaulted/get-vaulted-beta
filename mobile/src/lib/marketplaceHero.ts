import type { MarketplaceHeroSlide } from '../types/marketplaceUi';
import type { Product } from '../types';

const HERO_ACCENTS: [string, string][] = [
  ['#1a1208', '#0a0a0c'],
  ['#0f1419', '#1a0f08'],
  ['#120a1a', '#0a0c14'],
];

export function buildMarketplaceHeroSlides(products: Product[], max = 4): MarketplaceHeroSlide[] {
  return products
    .filter((p): p is Product & { imageUrl: string } => Boolean(p.imageUrl?.trim()))
    .slice(0, max)
    .map((p, i) => ({
      id: `hero-${p.id}`,
      productId: p.id,
      kicker: p.vaultVerified ? 'Vault verified' : 'Live in the vault',
      title: p.title,
      cta: 'View listing',
      imageUrl: p.imageUrl,
      accent: HERO_ACCENTS[i % HERO_ACCENTS.length],
    }));
}
