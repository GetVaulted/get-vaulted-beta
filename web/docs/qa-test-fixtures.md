# QA / development data vs production UI

Production builds intentionally **do not** ship static demo marketplace rows, generated live-room cards, or mock auction overlays. Empty states and API-backed lists drive the buyer experience.

## Where synthetic data still exists (isolated)

| Location | Purpose |
|----------|---------|
| `prisma/seed.ts` + `prisma/seed-marketplace-fixtures.ts` | **Local/dev database only.** Creates seed users, listings, and demo live rooms when you run the Prisma seed (skipped when `NODE_ENV=production` unless `ALLOW_PRODUCTION_SEED=true`). Not imported by Next.js pages. |
| `scripts/seed-live-auction-qa.ts` | **Manual QA helper** for live/IVS scenarios; run explicitly when testing. |
| `src/**/*.test.ts`, `src/**/*.integration.test.ts` | **Vitest** uses in-memory or test DB helpers (e.g. `seedUser`, `seedListing` in test files) — never bundled as default UI. |
| `tests/` (Playwright or e2e, if present) | Browser automation fixtures only. |

## Removed from user-facing bundles

- Static `marketplaceListings` content in `src/content/marketplace-listings.ts` (array is empty; types remain for DB mappers).
- Fabricated `liveShows` / catalog entries in `src/content/live-rooms.ts` (empty; types + filters remain).
- Homepage marketplace/break rows from `src/content/home-page.ts` (types only; sections load from `/api/listings` and `/api/live-rooms`).
- `NEXT_PUBLIC_SHOW_MOCK_LIVE_ITEM` mock overlay in `LiveAuctionRoom`.

## Optional dev workflow

After migrations, run `npx prisma db seed` (or your package script) on a **non-production** database to populate rows for manual testing. Never rely on seed data appearing in production UI without real DB rows.
