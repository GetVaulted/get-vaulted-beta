# Local QA pre-deploy gate

**Policy:** Beta (`beta.shopgetvaulted.com`) validates **near-final** behavior. It is **not** the primary debugging environment.

**Status (commerce / live):** Beta manual QA is **paused** until this gate is **green** on the build you intend to deploy.

Do not push to `get-vaulted-beta` / trigger Netlify until every row in the [regression matrix](#regression-matrix) is **Pass** locally.

---

## QA accounts (local)

| Role | Email | Password (default) |
|------|-------|-------------------|
| Seller | `sellerqa@getvaultedtest.com` | `VaultedBetaQA1!` |
| Buyer | `buyerqa@getvaultedtest.com` | same |

Project: **`xkaaicokjgmpbctfermj`** — same Supabase + Postgres for web and mobile (see [beta-environment-alignment.md](./beta-environment-alignment.md)).

---

## Step 0 — Automated (from `web/`)

```bash
npm run qa:pre-deploy
```

Runs:

| Command | What it checks |
|---------|----------------|
| `npm run build` | Next.js production compile + TypeScript |
| `npm run staging:validate` | Commerce staging integration path |
| `npm run verify:beta-env` | Local/mobile/web Supabase + DB ref alignment |

**Pass:** all commands exit 0.

Optional unit checks (fast):

```bash
npx vitest run src/lib/pick-prisma-user-for-supabase-auth.test.ts
```

---

## Step 1 — Local web QA pass

Host: `npm run dev` in `web/` (or `next start` after build).

| Check | Pass criteria |
|-------|----------------|
| Env | `DATABASE_URL` + `NEXT_PUBLIC_SUPABASE_URL` → project `xkaaicokjgmpbctfermj` |
| Seller sign-in | `/signin` works for `sellerqa` (Supabase-backed credentials path) |
| Seller HQ / live | Schedule or open an **auction** room (`roomType: auction`) |
| Buyer discovery API | `curl http://localhost:3000/api/live-rooms?limit=20` lists seller’s scheduled + live rooms |
| Connect status | `GET /api/stripe/connect/status` (Bearer sellerqa JWT) shows stable `stripe_account_id` after refresh |

Record: date · commit · `NEXTAUTH_URL` / port · notes.

---

## Step 2 — Local mobile Expo QA pass

From `mobile/`:

```bash
# .env must match web project + local API:
# EXPO_PUBLIC_SUPABASE_URL=https://xkaaicokjgmpbctfermj.supabase.co
# EXPO_PUBLIC_SITE_URL=http://<LAN-IP>:3000   # physical device
# or http://localhost:3000                    # emulator only
npx expo start -c
```

Rebuild after any `EXPO_PUBLIC_*` change.

| Check | Pass criteria |
|-------|----------------|
| Seller sign-in | `sellerqa` session loads Seller HQ |
| Buyer sign-in | `buyerqa` on second device or profile |
| API reachability | No “Could not reach Vaulted API” on Seller HQ refresh |

---

## Step 3 — Seller + buyer flow verification (local)

| # | Flow | Pass |
|---|------|------|
| S1 | Seller: payout setup already done → HQ shows **Ready/Complete** (not “needed”) | ☐ |
| S2 | Seller: schedule **auction** vault event | ☐ |
| S3 | Seller: optional — go live on that room | ☐ |
| B1 | Buyer: Home or **Live** tab lists seller’s **scheduled** show | ☐ |
| B2 | Buyer: **Live** tab lists seller’s **live** show (when live) | ☐ |
| B3 | Buyer: open room from discovery | ☐ |
| B4 | Buyer: place bid when host opens lot (if live + bidding) | ☐ |

---

## Step 4 — Visual confirmation (buyer live room states)

Use an **auction** room (`roomType: auction`). Confirm on device — **not** a break room.

| State | Expected UI | Must NOT show |
|-------|-------------|----------------|
| Waiting (no active lot / lot not open) | Branded copy, e.g. “The vault is being loaded.” / “Stay locked in — the host is setting the next lot.” | **Join Break**, **Claim Team**, **Pick team** |
| Waiting | Primary CTA disabled or “Lot loading” / “Bids open soon” | Slide-to-bid active |
| `lotBidPhase === bidding_open` | Current bid, next bid, **Bid $…** or slide-to-bid, timer | Break CTAs |
| Timer ended / closed | “Bidding closed” style copy | Break CTAs |
| Break room only (`roomType: break`) | Join Break / Claim team | Auction bid rail |

Screenshot or short screen recording optional; note device + build.

---

## Step 5 — Regression matrix (sign-off)

Mark **Pass** only after Steps 0–4 on the **same commit** you will deploy.

| ID | Regression | Seller local | Buyer local | Web API/local | Notes |
|----|------------|:------------:|:-----------:|:-------------:|-------|
| R1 | Auction room never shows Join Break / Claim Team | ☐ | ☐ | — | |
| R2 | Auction waiting uses branded vault copy (not generic “waiting for item”) | — | ☐ | — | |
| R3 | Bid controls only when `lotBidPhase === bidding_open` | — | ☐ | — | |
| R4 | Seller payout readiness persists across reload + sign-out/sign-in | ☐ | ☐ | ☐ | Same `stripe_account_id` |
| R5 | Scheduled + live rooms in buyer discovery | — | ☐ | ☐ | `GET /api/live-rooms` |
| R6 | Web sign-in works for mobile-created `sellerqa` | ☐ | — | ☐ | |
| R7 | No Supabase project / DB ref drift | — | — | ☐ | `verify:beta-env` |

**Pre-deploy gate:** ☐ Pass · Date ______ · Git commit ______ · Tester ______

---

## After local gate → beta

Only then:

1. Push branch → Netlify deploy.
2. Confirm Netlify env (see [beta-qa-reset-checklist.md](./beta-qa-reset-checklist.md) Step 0).
3. Re-run **smoke** on beta (not full debug): auth, discovery, one auction room state check.
4. Resume [commerce staging gate](./LIVE_AUCTION_E2E_QA.md#commerce-staging-gate) steps 0–3.

---

## What beta is for

| Use beta for | Do not use beta for |
|--------------|---------------------|
| Final env + TLS + Netlify parity | First reproduction of UI logic bugs |
| Stakeholder demo on near-final build | Iterating on state-machine / copy |
| Short smoke after local green | Discovering missing `EXPO_PUBLIC_*` in EAS |

---

## Related docs

- [beta-environment-alignment.md](./beta-environment-alignment.md)
- [beta-qa-reset-checklist.md](./beta-qa-reset-checklist.md) (on-beta smoke, after local green)
- [LIVE_AUCTION_E2E_QA.md](./LIVE_AUCTION_E2E_QA.md)
- [orders-fulfillment-qa-checklist.md](./orders-fulfillment-qa-checklist.md)
