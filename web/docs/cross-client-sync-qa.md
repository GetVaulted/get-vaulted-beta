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
| **Web buyer** (`/live/[id]`) | Supabase broadcast `gv-room-{id}` + debounced room GET fallback | Sub-second |
| **Web seller console** | Realtime + debounced REST reload (~40–120ms) | Sub-second |
| **Mobile buyer** | Supabase `gv-room-{id}` (`bid_placed`, `active_item_changed`, `queue_items`, `chat_message`) + 30s REST fallback (5s when Supabase unavailable) | **Sub-second** when `EXPO_PUBLIC_SUPABASE_*` configured |
| **Mobile seller host** | Host console poll **5s** while live | Up to 5s |
| **Discovery (live tab)** | Cached `gv_home_feed_v1` until invalidation | Minutes if not refreshed |

**Auction authority:** Web seller console + mobile buyers on the **same** Supabase project should converge within ~1s. Use web `/live/[id]` as a third-party witness if disputing mobile sync.

**Mobile env gate:** Both phones must have `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` matching web (ref `xkaaicokjgmpbctfermj`). Without Supabase, mobile falls back to 5s polling only.

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
| C4 | Mobile A buyer | Open room `R` | Within **~1s**, bid state matches web (realtime) |
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
| Live bid instant on web, slow on mobile | Mobile missing Supabase env | Set `EXPO_PUBLIC_SUPABASE_*` on both phones; restart Expo |
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
| F Realtime sprint (below) | ☐ | ☐ | ☐ | |

**Do not resume beta manual QA until env gate + this matrix pass on the same commit/build.**

---

## F — Realtime sprint QA (web seller + 2 mobile buyers)

**Setup:** Web seller on `/seller/live/[roomId]` (or break console). Mobile A = `buyerqa@…`, Mobile B = second buyer account. Same LAN API + Supabase on all three. Record room id `R`.

### F1 — Bid fanout + outbid

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| F1.1 | Web seller | Go live, push item, start auction | Console shows active lot + timer |
| F1.2 | Mobile A | Open room `R`, place bid | Bid accepted; A shows winning |
| F1.3 | Mobile B | Observe within **~1s** | High bid matches A; no manual refresh |
| F1.4 | Mobile B | Outbid A | B shows winning |
| F1.5 | Mobile A | Observe | Outbid toast + haptic within ~1s |
| F1.6 | Web seller | Observe console | High bid + leader update within ~1s (no full page reload) |

### F2 — Reconnect during auction

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| F2.1 | All | Active auction running | — |
| F2.2 | Mobile A | Background app **10–15s**, return | “Live connection restored” banner optional |
| F2.3 | Mobile A | Observe timer + high bid | Matches web seller within ~2s; no stuck “Placing…” |
| F2.4 | Mobile A | Place bid after return | Accepted; other clients update |

### F3 — Skip active lot

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| F3.1 | Web seller | Skip currently active lot | Queue advances or clears active |
| F3.2 | Mobile A + B | Observe within **~1s** | Active item / bid UI updates without waiting for 30s poll |
| F3.3 | Web seller | Console | Queue + pinned lot match mobiles |

### F4 — Chat realtime + fallback

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| F4.1 | Mobile A | Send chat message | Appears on Mobile B within ~1s |
| F4.2 | Mobile B | Reply | Appears on A + web seller chat within ~1s |
| F4.3 | Mobile A | Airplane mode **~15s**, reconnect | Messages reload; no permanent duplicate spam |
| F4.4 | Mobile A | Send after reconnect | Delivered via realtime; if offline, appears within **30s** poll fallback |

### F5 — Break disclaimer (break rooms only)

| Step | Actor | Action | Pass criteria |
|------|-------|--------|---------------|
| F5.1 | Web seller | Start **break** room (not auction-only sale) | — |
| F5.2 | Mobile A | First entry to room `R` | Disclaimer modal before bid/chat |
| F5.3 | Mobile A | Decline | Leaves room |
| F5.4 | Mobile A | Re-enter, accept | Bid + chat enabled |
| F5.5 | Mobile A | Leave and re-enter same room | Disclaimer **not** shown again (AsyncStorage per user+room) |
| F5.6 | Mobile B | First entry | Disclaimer shown independently (per-user storage) |

---

## Realtime sign-off

| Scenario | Web seller | Mobile A | Mobile B | Notes |
|----------|:----------:|:--------:|:--------:|-------|
| F1 Bid + outbid | ☐ | ☐ | ☐ | |
| F2 Reconnect | ☐ | ☐ | ☐ | |
| F3 Skip lot | ☐ | ☐ | ☐ | |
| F4 Chat | ☐ | ☐ | ☐ | |
| F5 Break disclaimer | ☐ | ☐ | ☐ | break rooms only |
