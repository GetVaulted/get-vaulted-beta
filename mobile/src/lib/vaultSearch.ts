import type { LiveStream, Product, ScheduledStream } from '../types';

function matchesQuery(text: string | null | undefined, q: string): boolean {
  if (!q) return true;
  return (text ?? '').toLowerCase().includes(q);
}

export function filterProductsByQuery(products: Product[], rawQuery: string): Product[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return products;
  return products.filter(
    (p) =>
      matchesQuery(p.title, q) ||
      matchesQuery(p.seller.name, q) ||
      matchesQuery(p.seller.handle, q) ||
      matchesQuery(p.category, q) ||
      matchesQuery(p.description, q) ||
      matchesQuery(p.storyline, q),
  );
}

export function filterLiveStreamsByQuery(streams: LiveStream[], rawQuery: string): LiveStream[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return streams;
  return streams.filter(
    (s) =>
      matchesQuery(s.title, q) ||
      matchesQuery(s.host.name, q) ||
      matchesQuery(s.host.handle, q) ||
      matchesQuery(s.category, q) ||
      matchesQuery(s.showDescription, q),
  );
}

export function filterScheduledStreamsByQuery(streams: ScheduledStream[], rawQuery: string): ScheduledStream[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return streams;
  return streams.filter(
    (s) =>
      matchesQuery(s.title, q) ||
      matchesQuery(s.host.name, q) ||
      matchesQuery(s.host.handle, q) ||
      matchesQuery(s.category, q),
  );
}
