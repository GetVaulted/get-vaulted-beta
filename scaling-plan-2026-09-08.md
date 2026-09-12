# Get Vaulted — Scaling Plan: 10 Concurrent Shows / 5,000 Concurrent Viewers

**Prepared:** September 8, 2026
**Trigger:** Investigation into random live-video disconnects during shows led to a confirmed root cause (DB connection stalls) and a broader question — can current infrastructure support 10 concurrent shows with 5,000 total concurrent viewers?

**Short answer: not yet, on any of the three layers checked.** This document lays out what's confirmed, what's still unknown, and a prioritized plan.

---

## 1. What's confirmed today

### 1a. The immediate bug (fixed, shipped commit `768054a`)

A production log showed a database query that every buyer/host client polls (to check if the live video is healthy) stalling for **219,921ms — almost 4 minutes** — during a live show, immediately followed by a real-time broadcast failure to that same room. Root cause: the app's database connection pool has no timeout when a caller is waiting for a free connection, so under load a query can queue indefinitely instead of failing fast. The fix makes that specific query fail after 5 seconds instead of hanging, so the client's existing (well-built) retry logic can recover in seconds instead of minutes. This buys reliability at *current* traffic levels — it does not add capacity.

### 1b. Database (Supabase) — confirmed via your dashboard screenshot

- Compute tier: **Micro** (t4g.micro-equivalent — 2 vCPU burstable, ~1GB RAM)
- **60 max direct Postgres connections**, ~200 max pooler (Supavisor) connections
- Currently **22/60 connections in use** — over a third of total capacity — without a large show running at the time of the screenshot
- CPU/compute usage spiked to 91% recently per the same dashboard

This tier is Supabase's smallest paid compute add-on. It is not sized for concurrent live-commerce traffic at any meaningful scale, let alone 5,000 concurrent viewers.

### 1c. Hosting (Netlify) — confirmed: Pro plan

- Netlify Pro's default concurrency ceiling is **~125 concurrent serverless function invocations**. Beyond that, requests queue or get rejected outright.
- [Netlify community: default Pro concurrency](https://answers.netlify.com/t/serverless-functions-limits/36204)

### 1d. App polling load — confirmed via code audit

The mobile app polls the API on fixed intervals rather than relying primarily on real-time push, and **none of the high-frequency polling endpoints have server-side rate limits protecting them from raw client volume** (the only rate limits found throttle the server's own downstream AWS calls, not inbound buyer traffic).

At 5,000 concurrent viewers spread over 10 shows (500/show), sustained request volume from polling alone:

| Loop | Interval | Est. req/s at 5,000 viewers |
|---|---|---|
| Stream status (`GET /stream`) | 2.5s | **~2,000 req/s** |
| Chat fallback poll (if realtime not primary) | 4s | ~1,250 req/s |
| Room moderation state | 12s | ~417 req/s |
| Room snapshot fallback (possible double-poll) | 12–20s | up to ~417 req/s |
| Buyer room snapshot | 30s (5s if realtime disconnected) | ~167 req/s |
| Presence heartbeat | 45s | ~111 req/s |
| Notification sync | 60s | ~83 req/s |

**The single biggest offender is stream-status polling at ~2,000 req/s** — this alone is roughly **16x** Netlify Pro's ~125 concurrent-invocation ceiling, and would consume the entire 60-connection database budget many times over per second even with quick queries.

---

## 2. What's still unknown

- **Supabase Realtime (websocket) connection limits** for your current plan — separate from the Postgres connection limits above.
- **Actual per-show viewer distribution** — 5,000 across 10 shows evenly (500 each) vs. concentrated in 1-2 popular shows changes which limits get hit first.

### AWS IVS service quotas — confirmed, and this layer is in good shape

Checked via AWS Service Quotas console (Sep 8, 2026). Most limits have large headroom relative to the 5,000-viewer / 10-show target:

| Quota | Applied value | Target need | Headroom |
|---|---|---|---|
| Concurrent subscriptions (WebRTC viewers) | 20,000 | 5,000 | Comfortable |
| Concurrent views (HLS viewers) | 15,000 | 5,000 | Comfortable |
| Concurrent publishers (hosts/co-hosts) | 1,000 | ~10-30 | Comfortable |
| Channels | 5,000 | 10 | Comfortable |
| **Compositions (concurrent, account-wide)** | **20** | 10 (1 per show) | **Thin — flagged below** |
| Concurrent compositions per stage | 5 | 1 | Comfortable |

**Compositions is the one to act on.** Each show running in the app's primary WebRTC mode mirrors itself into one composition (the Stage→HLS bridge for non-WebRTC viewers). 10 concurrent shows = 10 compositions, which fits under the current limit of 20 — but with no margin, and there's a specific reason margin matters here: the app deliberately delays tearing down a composition for 45 seconds after a host disconnects (`schedulePausedBroadcastAwsTeardown` in `web/src/services/ivs.ts`), so buyers aren't told the show is "over" during a normal, recoverable reconnect. If disconnects cluster across multiple shows around the same time — plausible during a broader network blip, or before Phase 2's DB-contention fixes land — you could briefly have more compositions in flight than shows actually live, eating into that 20 budget. Recommend requesting an increase to 50 now, while there's no time pressure (AWS quota increases aren't instant).

---

## 3. Why this isn't a one-lever fix

Three independent ceilings all need raising together — fixing only one still leaves you capped by the others:

- Upgrading **Supabase compute** alone raises the connection ceiling but doesn't change Netlify's ~125 concurrent-function limit or reduce the ~2,000 req/s of polling traffic hitting it.
- Upgrading **Netlify's plan** alone lets more requests run concurrently but they'd still be hammering a 60-connection database.
- **Reducing polling load** (the architecture fix — leaning on real-time push instead of fixed-interval polling) is the highest-leverage change of the three, because it shrinks the request volume hitting *both* of the other ceilings, and it's the only one of the three that's a code change rather than a recurring cost increase.

---

## 4. Recommended plan, in priority order

### Phase 1 — Already done
- ✅ Fail-fast timeout on the stream-status query (commit `768054a`) — stops one stuck query from stranding video for minutes at current traffic.

### Phase 2 — Near-term, moderate effort, no new cost — ✅ done
1. ✅ **Connection-acquire timeout** — global 8s read-query deadline via a Prisma client extension (`prisma-pg-factory.ts`, commit `cc5dd021`), scoped to read operations only (writes are never raced against a timeout, to avoid duplicate-submit risk).
2. ✅ **Server-side rate limits** — added to `GET /stream`, `GET /api/live-rooms/:id`, and `GET /api/live-rooms/:id/moderation` (commit `eb11e090`), keyed per-client-IP-per-room so one misbehaving client can no longer generate unbounded load.
3. ✅ **Double-poll check — confirmed not present.** `LivePinnedActionBar`'s internal poll only runs `if (!usingExternalSync)`, and `VerticalLiveFeed.tsx` always passes `liveSession.fetchSnapshot` as `onRefreshSnapshot`, so in production that internal poll is disabled and every refresh already routes through the single `useLiveRoomRealtimeSession` fetch. No redundant load; no code change needed.
4. ✅ **`realtimePrimary` verified true in production.** Hardcoded `true` at both `useLiveRoomChat` call sites (`VerticalLiveFeed.tsx` buyer feed, `SellerLiveHostView.tsx` host view) — chat is always on the 30s fallback poll, never silently on the 4s one.

### Phase 3 — Architecture change, larger effort, biggest payoff — ✅ done
5. ✅ **Stream-status is now realtime-push-primary** (commit `b59399c`). The active playback surface (`useLiveStagePlayback`) backs its `GET /stream` poll off from 2.5s to 20s once the room's realtime channel is confirmed connected, and only falls back to the tight 2.5s cadence when it isn't — realtime `stream_status` broadcasts already drive an immediate refetch on every real change, so the poll is now a reconciliation safety net rather than the primary signal. This directly addresses the ~2,000 req/s offender identified in the polling audit. Prefetch/neighbor slides were already at 10s and are unaffected.
6. ✅ **Same pattern applied to moderation** (commit `b59399c`). `useLiveRoomModeration` backs its poll off from 12s to 30s once the shared room channel reports SUBSCRIBED, tracked via its own connection-status subscription (self-contained, since it's also used standalone by the seller host view). While wiring this, found and fixed a genuine double-fire bug: the buyer path had both the hook's own moderationChanged subscription and a redundant external `onModerationChanged` forward, so every moderation event was triggering two `GET /moderation` calls per active viewer — removed the redundant one.
   Room-snapshot polling (`useLiveRoomRealtimeSession`) was checked and already followed this exact connected/disconnected pattern (30s vs 5s) — no change needed there.

### Phase 4 — Infrastructure spend, do once Phase 2-3 land
7. **Upgrade Supabase compute** from Micro to at least Small (raises both direct and pooler connection ceilings substantially). Cost: roughly $50-150/mo added to current $25 Pro base, per current published estimates — confirm exact current pricing on Supabase's site before committing.
8. **Talk to Netlify about Enterprise-tier concurrency** if Phase 3's traffic reduction still isn't enough headroom under Pro's ~125 concurrent limit at your target viewer count.
9. **Request an AWS IVS Compositions quota increase (20 → 50)** — the one AWS limit worth padding ahead of time; see draft request below. Everything else on the AWS side already has comfortable headroom for the target scale.

### AWS Compositions quota increase — request text

Submit via AWS Support Center → Create case → Service limit increase → Service: "Interactive Video Service (IVS)" → Quota: "Compositions":

> We run live-shopping broadcasts on Amazon IVS Real-Time Stages, with each active show mirroring its Stage into one Composition (Stage→Channel HLS) so non-WebRTC viewers can watch. We're scaling toward running up to 10 concurrent shows and are requesting an increase to our Compositions quota from 20 to 50 to maintain a safety margin — our system has a deliberate delayed teardown (45s) for compositions during host reconnects, so transient overlaps during network hiccups are expected and we'd like headroom above our steady-state concurrent-show count rather than running at the limit.

---

## 5. Bottom line

At today's infrastructure, 5,000 concurrent viewers across 10 shows is still not achievable on Supabase Micro and Netlify Pro alone — those connection/concurrency ceilings are a paid-upgrade problem, not a code problem. But Phases 1-3 are now complete: the stream-status polling loop (the single largest offender in the audit, ~2,000 req/s) is realtime-primary rather than continuous, moderation follows the same pattern, chat and room-snapshot were already realtime-primary, every hot endpoint has a rate-limit safety net, and every DB read has a hard timeout so one stuck query can no longer strand video for minutes. What's left is entirely Phase 4: paid infrastructure headroom (bigger Supabase compute, possibly a higher Netlify tier) and submitting the AWS IVS Compositions quota increase — no further code changes are on the critical path to the 10-shows/5,000-viewers target.
