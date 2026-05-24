# Launch readiness checklist — PC beta simulation

**Date:** 2026-05-24  
**Environment:** `https://beta.shopgetvaulted.com` (Supabase `xkaaicokjgmpbctfermj`)  
**Accounts:** `sellerqa@getvaultedtest.com` / `buyerqa@getvaultedtest.com` · password `VaultedBetaQA1!`

Use this log during **today’s final launch-style manual pass** on PC (web + mobile). Mark each row **PASS**, **FAIL**, or **BUG** and add notes.

**Prep (run once before testing):**

```bash
cd web
npm run verify:beta-env

# Preview exactly what will be deleted:
$env:CONFIRM_BETA_FULL_WIPE="1"; $env:ALLOW_BETA_QA_SEED="1"; npm run qa:wipe-beta-full -- --dry-run

# COMPLETE beta wipe + fresh seed (launch simulation):
$env:CONFIRM_BETA_FULL_WIPE="1"; $env:ALLOW_BETA_QA_SEED="1"; npm run qa:wipe-beta-full
```

Uses `qa:wipe-beta-full` — deletes **all** beta users, listings, live rooms, orders, chats, Auth users, then seeds only sellerqa/buyerqa.  
Partial reset (preserves other beta users): `qa:reset-beta-environment` instead.

Clear QA session on every client, then sign in fresh as sellerqa / buyerqa.

---

## Environment bootstrap

| # | Check | Result | Notes |
|---|-------|--------|-------|
| E1 | `verify:beta-env` — single ref `xkaaicokjgmpbctfermj` | | |
| E2 | Reset script completed without errors | | |
| E3 | Seller HQ shows payout **Complete/Ready** (no manual Stripe onboarding needed) | | |
| E4 | Buyer has shipping address + saved test card | | |
| E5 | Live tab / marketplace has **no** stale sellerqa rooms or old test listings | | |
| E6 | Web sign-in at `/signin` works for sellerqa | | |

---

## Marketplace — seller (PC / web)

| # | Flow | Result | Notes |
|---|------|--------|-------|
| M1 | Create listing (draft autosave) | | |
| M2 | Fill required fields (photos, shipping, price) | | |
| M3 | Publish listing → appears in seller inventory | | |
| M4 | Listing visible on marketplace browse | | |
| M5 | Open PDP — images, price, seller, shipping correct | | |
| M6 | Offers/trades toggles visible when enabled on listing | | |
| M7 | Edit listing (optional) | | |

---

## Marketplace — buyer

| # | Flow | Result | Notes |
|---|------|--------|-------|
| M8 | Buyer discovers published listing (browse or direct link) | | |
| M9 | PDP loads on buyer session | | |
| M10 | Buy Now → checkout / payment path (or clear expected error) | | |
| M11 | Offer submit visible when listing allows offers | | |
| M12 | Trade offer entry visible when listing allows trades | | |

---

## Live — seller console

| # | Flow | Result | Notes |
|---|------|--------|-------|
| L1 | Create / schedule live show | | |
| L2 | Enter seller console / host view | | |
| L3 | Push item to queue (from inventory or quick add) | | |
| L4 | **Start Auction** from HUD — lot goes active | | |
| L5 | Timer starts / visible to host | | |
| L6 | Mark sold (or end lot) | | |
| L7 | Next lot — queue advances cleanly | | |
| L8 | Live chat send/receive as host | | |
| L9 | Refresh / reconnect — host state recovers | | |

---

## Live — buyer

| # | Flow | Result | Notes |
|---|------|--------|-------|
| L10 | Buyer joins live room from Live tab | | |
| L11 | Active lot + current bid visible | | |
| L12 | Place bid — accepted | | |
| L13 | Outbid flow — second bid wins, UI updates | | |
| L14 | Timer countdown behaves correctly | | |
| L15 | Live chat send/receive as buyer | | |
| L16 | Refresh / reconnect — buyer rejoins same room state | | |

---

## Cross-cutting

| # | Flow | Result | Notes |
|---|------|--------|-------|
| X1 | Seller + buyer sessions stable across 15+ min show | | |
| X2 | No legacy `brysmith31` or clutter rooms in discovery | | |
| X3 | Orders list empty at start; new order appears after buy/win (if tested) | | |
| X4 | Automated smoke (optional): `node scripts/_beta-marketplace-smoke.mjs` | | |
| X5 | Automated live bid (optional): `node scripts/_beta-live-bid-smoke.mjs` | | |

---

## Sign-off

| Milestone | Status | Tester | Time |
|-----------|--------|--------|------|
| Environment reset | | | |
| Marketplace flows (M*) | | | |
| Live seller flows (L1–L9) | | | |
| Live buyer flows (L10–L16) | | | |
| **Launch-ready for prod deploy** | **No** until all critical rows Pass | | |

### Critical blockers (FAIL / BUG)

_List anything that must ship before launch:_

1. 
2. 
3. 

---

## Related docs

- [beta-qa-reset-checklist.md](./beta-qa-reset-checklist.md) — account bootstrap details
- [LIVE_AUCTION_E2E_QA.md](./LIVE_AUCTION_E2E_QA.md) — extended live auction matrix
- [local-qa-pre-deploy-gate.md](./local-qa-pre-deploy-gate.md) — pre-deploy gate (run before beta deploy)
