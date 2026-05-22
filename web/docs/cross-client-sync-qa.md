# Cross-client sync QA (web + 2 mobiles)

**Goal:** Web seller session, mobile A, and mobile B must read/write the **same** Supabase project + Postgres + API host and show consistent state after mutations.

**Prerequisite:** [qa-environment-reset.md](./qa-environment-reset.md) green (`npm run qa:local-env-check`, Clear QA Session on all three clients, diagnostics parity).

---

## Shared backend checklist (all clients)

| Check | Web | Mobile A | Mobile B |
|-------|-----|----------|----------|
| Supabase ref = `xkaaicokjgmpbctfermj` | `/qa/diagnostics` or `/api/auth/config` | Settings → QA environment | same |
| API host = same origin | browser origin | `EXPO_PUBLIC_SITE_URL` | same URL (not localhost on one device only) |
| Signed-in seller = same account | `sellerqa@…` email | same email | same email |
| Prisma user id matches | `/api/qa/session-debug` `canonicalPrismaUserId` | same on diagnostics | same |

**LAN rule:** Physical devices must use `http://<LAN-IP>:3000` for `EXPO_PUBLIC_SITE_URL`, not `localhost`. Web can use `localhost:3000` on PC — that is fine if mobiles point at the PC’s LAN IP.

---

## How sync works today

### Listings (status, pause, publish, end, delete)

| Layer | Mechanism | Latency |
|-------|-----------|---------|
| **Source of truth** | Postgres via `GET/PATCH /api/listings` | — |
| **Web → web** | `gv-listings-updated` window event → browse, My Listings, featured row | Immediate (same tab); other tabs on manual refresh |
| **Mobile → mobile/web discovery** | `clearHomeFeedCache()` → `subscribeHomeFeedInvalidation` on Home, Marketplace, Seller HQ inventory | On mutation + tab focus refetch |
| **Realtime** | **None** for listing rows | — |

**After PATCH from mobile:** Seller Studio reloads + home feed cache bust. Seller HQ refetches on focus or pull-to-refresh.

**After PATCH from web:** Seller Studio reload + `gv-listings-updated`. Mobile updates after cache bust (if web could bust mobile — it cannot); mobile updates when seller opens HQ / pulls refresh / mutates from mobile.

### Live shows / auction room

| Client | Mechanism | Typical lag |
|--------|-----------|-------------|
| **Web buyer** (`/live/[id]`) | Supabase broadcast `gv-room-{id}` + 350ms room GET fallback | Sub-second |
| **Web seller console** | Realtime + debounced REST reload | Sub-second |
| **Mobile buyer** | `GET /api/live-rooms/[id]` poll **4s** (auction) | Up to 4s |
| **Mobile seller host** | Host console poll **5s** while live | Up to 5s |
| **Discovery (live tab)** | Cached `gv_home_feed_v1` until invalidation | Minutes if not refreshed |

**Auction authority:** Treat **web live room** as ground truth for bid timer, lot changes, and chat during sync QA.

---

## Test matrix

Use one listing id `L` and one live room id `R`. Record ids in notes.

### A — Listing status (seller)

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| A1 | Web | Open `/seller/listings/L`, **Pause** (→ draft) | Web studio shows draft |
| A2 | Mobile A | Seller HQ → Listings → open `L` (or pull refresh) | Status = draft |
| A3 | Mobile B | Same as A2 | Status = draft |
| A4 | Mobile A | **Publish** from Seller Studio | Status = active/auction_live |
| A5 | Web + B | Refresh listings / reopen studio | Matches A4 |
| A6 | Web | **Mark sold** or end listing | Removed or ended on all three |
| A7 | All | Marketplace browse: listing hidden or ended | Consistent |

### B — Listing field edit

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| B1 | Mobile A | Change price/shipping in Seller Studio, Save | Studio shows new values |
| B2 | Web | Reload `/seller/listings/L` | Same values |
| B3 | Mobile B | Open studio for `L` | Same values |

### C — Live room state

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| C1 | Web seller | Schedule + go live on room `R` | Web console live |
| C2 | Mobile A/B | Live tab pull-to-refresh | Room appears (API source line shows API + time) |
| C3 | Web seller | Start lot / open bidding | Web buyers see bid UI |
| C4 | Mobile A buyer | Open room `R` | Within **~4s**, bid state matches web (not instant) |
| C5 | Web seller | End room | Mobile discovery drops or shows ended after refresh |

### D — Buyer bid → seller visibility

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| D1 | Mobile B (buyerqa) | Place bid in room `R` on **web** `/live/R` | Bid accepted |
| D2 | Web seller console | Current bid updates (realtime) | Matches D1 |
| D3 | Mobile A seller host | Host console within **~5s** | Matches D1 |

### E — Cold start / reopen

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| E1 | All | Force-quit app / close tab | — |
| E2 | All | Reopen, sign in, open same listing/room | Latest DB state (no ghost active listing) |

---

## Failure triage

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Mobile PATCH fails 401 | Was cookie-only API (fixed: Bearer on PATCH/DELETE) | Pull latest web API |
| HQ inventory stale after mobile edit | Cache not busted | Pull latest mobile; run **Clear QA Session** |
| Web browse updates, mobile not | No cross-platform event | Pull refresh Live tab / HQ Listings |
| Live bid instant on web, slow on mobile | Mobile has no room realtime | Expected; use web for auction QA |
| Different room counts | Wrong API URL or cache | Compare QA diagnostics API base + discovery line |
| Payout/listing differ per device | Duplicate Prisma users / wrong canonical id | `qa:local-env-check` + session-debug warning |
| Optimistic bid wrong on web | HTTP/realtime race | Refresh room; check `bid_placed` in network tab |

---

## Commands

```bash
# From web/
npm run qa:local-env-check -- --api-base http://<LAN-IP>:3000

# Spot-check listing API (seller Bearer token from Supabase session)
curl -s "http://<LAN-IP>:3000/api/listings?scope=mine" -H "Authorization: Bearer <token>"

# Public discovery
curl -s "http://<LAN-IP>:3000/api/live-rooms?limit=20"
```

---

## Sign-off

| Scenario group | Web | Mobile A | Mobile B | Notes |
|----------------|:---:|:--------:|:--------:|-------|
| A Listing status | ☐ | ☐ | ☐ | |
| B Field edit | ☐ | ☐ | ☐ | |
| C Live room | ☐ | ☐ | ☐ | |
| D Buyer bid | ☐ | ☐ | ☐ | |
| E Reopen | ☐ | ☐ | ☐ | |

**Do not resume beta manual QA until env gate + this matrix pass on the same commit/build.**
