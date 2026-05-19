/**
 * Post-smoke helper: verify a listing id exists on beta web API (Prisma cuid + listing-images).
 *
 *   node scripts/verify-listing-on-beta.mjs <listingId>
 *
 * Optional: BETA_API_BASE_URL=https://beta.shopgetvaulted.com
 */
const base = (process.env.BETA_API_BASE_URL || 'https://beta.shopgetvaulted.com').replace(/\/+$/, '');
const listingId = process.argv[2]?.trim();

const CUID_RE = /^c[a-z0-9]{24}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`OK: ${msg}`);
}

if (!listingId) {
  console.error('Usage: node scripts/verify-listing-on-beta.mjs <listingId>');
  process.exit(1);
}

if (UUID_RE.test(listingId)) {
  fail(`Listing id looks like UUID, expected Prisma cuid: ${listingId}`);
}
if (!CUID_RE.test(listingId)) {
  console.warn(`WARN: id does not match typical Prisma cuid pattern: ${listingId}`);
} else {
  pass(`Listing id is Prisma-style cuid: ${listingId}`);
}

const publishedRes = await fetch(`${base}/api/listings?scope=published`);
const publishedBody = await publishedRes.json().catch(() => ({}));
if (!publishedRes.ok || !Array.isArray(publishedBody.listings)) {
  fail(`scope=published: ${publishedRes.status}`);
}
const inPublished = publishedBody.listings.some((l) => l.id === listingId);
if (inPublished) pass('Found in GET ?scope=published');
else console.warn('WARN: not in published feed yet (may need refresh or seller visibility)');

const idsRes = await fetch(
  `${base}/api/listings?scope=ids&ids=${encodeURIComponent(listingId)}`,
);
const idsBody = await idsRes.json().catch(() => ({}));
if (idsRes.status === 400 && idsBody.error === 'Invalid scope') {
  fail('scope=ids returned Invalid scope — beta API gate not satisfied');
}
if (!idsRes.ok) fail(`scope=ids: ${idsRes.status} ${JSON.stringify(idsBody)}`);
pass('scope=ids batch hydration works');

const listing = Array.isArray(idsBody.listings)
  ? idsBody.listings.find((l) => l.id === listingId)
  : null;
if (!listing) {
  console.warn('WARN: listing not returned by scope=ids (status may not be active/auction_live)');
} else {
  const urls = listing.imageUrls ?? [];
  if (!urls.length) console.warn('WARN: no imageUrls on listing');
  const hasListingImages = urls.some(
    (u) => typeof u === 'string' && /listing-images/i.test(u),
  );
  const hasLocalOnly = urls.some((u) => typeof u === 'string' && u.startsWith('/uploads/'));
  if (hasListingImages) pass('Image URL uses listing-images bucket');
  else if (hasLocalOnly) console.warn('WARN: image is local /uploads path (expected listing-images on beta)');
  else console.warn(`WARN: image URLs: ${urls.join(', ') || '(none)'}`);
}

const detailRes = await fetch(`${base}/api/listings/${encodeURIComponent(listingId)}`);
const detailBody = await detailRes.json().catch(() => ({}));
if (detailRes.ok && detailBody.marketplace) {
  pass('GET /api/listings/[id] returns marketplace payload');
} else if (detailRes.status === 404) {
  console.warn('WARN: detail 404 (draft or not publicly visible)');
} else {
  fail(`detail: ${detailRes.status}`);
}

console.log(`\nWeb marketplace: ${base}/marketplace`);
console.log(`Web product (slug may differ): ${base}/marketplace/${encodeURIComponent(listingId)}`);
console.log('\nVerify on device: Home, Marketplace, Product Detail, Orders/Trade thumbnails.');
