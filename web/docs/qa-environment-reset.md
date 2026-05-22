# QA environment reset (required before manual QA)

**Policy:** Do not run live/commerce manual QA until `npm run qa:local-env-check` passes and every client has been reset.

## 1. Automated gate (from `web/`)

```bash
npm run dev
# separate terminal:
npm run qa:local-env-check
# physical device — match LAN IP:
npm run qa:local-env-check -- --api-base http://192.168.x.x:3000
```

Verifies: web + mobile Supabase ref, Postgres, `sellerqa` / `buyerqa` in Auth + Prisma, no duplicate email rows, live rooms via `GET /api/live-rooms`, canonical seller Prisma pick.

## 2. Clear session on every client

| Client | Action |
|--------|--------|
| Mobile | Settings → **QA environment** → **Clear QA session** (enable `EXPO_PUBLIC_ENABLE_DEV_TOOLS=1` if the row is hidden) |
| Web | Open `/qa/diagnostics` → **Clear QA session (sign out)** |

Then sign in again as `sellerqa` / `buyerqa` on each device.

## 3. Diagnostics surfaces

| Surface | URL / path |
|---------|------------|
| Web panel | `/qa/diagnostics` (dev or `GV_ALLOW_QA_SESSION_DEBUG=1`) |
| API | `GET /api/qa/session-debug` (cookie or Bearer) |
| Mobile | Settings → QA environment |

Shows: API base, Supabase ref, email, Prisma id, seller readiness, public room count, discovery source.

## 4. Discovery rules (mobile)

- When `EXPO_PUBLIC_SITE_URL` is set, live discovery uses **only** `GET /api/live-rooms` (no Supabase fallback).
- Pull-to-refresh on **Live** busts feed cache and refetches.
- Live tab shows last fetch source + time.

## 5. Beta deploy

Set `GV_ALLOW_QA_SESSION_DEBUG=1` on Netlify **only** while debugging env drift; remove after QA is stable.

## After env gate → cross-client sync

Run [cross-client-sync-qa.md](./cross-client-sync-qa.md) on web + two mobiles before listing/live manual scenarios.

---

## Related

- [local-qa-pre-deploy-gate.md](./local-qa-pre-deploy-gate.md)
- [cross-client-sync-qa.md](./cross-client-sync-qa.md)
- [beta-environment-alignment.md](./beta-environment-alignment.md)
