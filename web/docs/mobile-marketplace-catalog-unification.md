# Mobile ↔ web marketplace catalog unification

Do **not** smoke test mobile against beta until the unified web listing API is deployed to beta. Mobile unification code assumes the same Prisma-backed `/api/listings` surface as local web.

**Do not continue device smoke testing until `npm run check:beta-listings-api` exits 0.** A failing gate means beta API deployment lag — not mobile bugs.

### Current blocker (check before every smoke run)

`GET /api/listings?scope=ids` must not return `400 Invalid scope`. Mobile depends on `scope=ids` for:

- trade hydration
- order thumbnails
- batch listing lookup
- cross-platform listing references

## Required order

1. **Deploy web/beta** with unified marketplace API changes (Netlify + Prisma migrate).
2. **Confirm beta endpoints** (automated gate):

   ```bash
   cd web
   npm run check:beta-listings-api
   ```

   Or:

   ```bash
   BETA_API_BASE_URL=https://beta.shopgetvaulted.com node scripts/beta-unified-listings-api-readiness.mjs
   ```

   **Stop here if exit code ≠ 0.** Deploy web unified listings API to beta first.

   Required beta readiness:

   | Endpoint | Expectation |
   |----------|-------------|
   | `GET /api/listings?scope=published` | `200`, `{ listings: [] }` or populated array |
   | `GET /api/listings?scope=ids` | `200`, `{ listings: [] }` when `ids` empty |
   | `POST /api/listings` | `401` without Bearer (route exists) |
   | `POST /api/uploads/listing-image` | `401` without Bearer |
   | `GET /api/listings/[id]` | `404` JSON for unknown id |

3. **Restart Expo** so `EXPO_PUBLIC_*` rebundles:

   ```bash
   cd mobile
   npx expo start --clear
   ```

4. **Device smoke test** with `EXPO_PUBLIC_SITE_URL=https://beta.shopgetvaulted.com` (or LAN dev URL only when web runs locally).

## Do not commit/push mobile unification until

- [ ] Mobile-created listing appears on web marketplace
- [ ] Web-created listing appears on mobile feed/detail
- [ ] Listing id is a Prisma **cuid** (not a client-only or legacy id)
- [ ] Images use **listing-images** storage URLs (Supabase bucket on beta)
- [ ] Product detail works both directions (mobile → web parity, web → mobile)

## If beta API is not deployed first

Typical false failures (not mobile bugs):

| Symptom | Likely cause |
|---------|----------------|
| `401` on publish | Bearer routes exist but auth/env mismatch; or old deploy |
| `Invalid scope` on feed/hydration | `scope=ids` / `scope=published` not on beta yet |
| Listing missing after publish | POST succeeded locally but mobile points at stale beta |
| Broken batch hydration | `scope=ids` returns 400 instead of `{ listings: [] }` |

## Goal

Validate **one shared marketplace catalog** (Prisma listings + unified API) on beta before pushing mobile unification to the main branch.
