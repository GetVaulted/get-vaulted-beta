# Seller Home QA Checklist

Use this checklist for quick manual validation of the new Seller Home flow.

Tester: ________  
Date: ________  
Device/Browser: ________

## 1) New seller (no payouts, no shipping address)

- [ ] **Expected behavior:** Seller Home loads with setup progress showing both required items as needed.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** `Go Live` does not enter live flow; it guides seller to required setup.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** `Continue setup` opens payouts setup flow.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** `Add shipping address` opens the shipping address form section.  
  **Notes:** ______________________________________________

## 2) Seller with payouts complete, no shipping address

- [ ] **Expected behavior:** Setup progress shows payouts added, shipping needed.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** Payout card shows `Payouts ready` and `Manage payouts`.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** `Go Live` still blocks entering live flow until shipping address is saved.  
  **Notes:** ______________________________________________

## 3) Seller fully ready (payouts + shipping complete)

- [ ] **Expected behavior:** Setup progress shows ready state for live.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** `Go Live` routes to seller live flow (`/seller/live`).  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** Required section shows both required items as added.  
  **Notes:** ______________________________________________

## 4) Go Live behavior by state

- [ ] **Expected behavior:** No payouts + no shipping -> `Go Live` guides to setup (no dead click).  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** Payouts complete + no shipping -> `Go Live` still blocked/guided.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** Fully ready -> `Go Live` enters normal live management flow.  
  **Notes:** ______________________________________________

## 5) Create Listing behavior

- [ ] **Expected behavior:** Hero `Create Listing` routes to listing creation (`/account/listings/new`).  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** Listings card `Create Listing` routes to same listing creation flow.  
  **Notes:** ______________________________________________

## 6) Add/Edit shipping address behavior

- [ ] **Expected behavior:** `Add shipping address` / `Edit shipping address` jumps to shipping form.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** Saving incomplete address shows clear inline message (`Please complete your address.`).  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** Saving valid address shows success (`Shipping address saved.`).  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** Setup/readiness updates immediately after save.  
  **Notes:** ______________________________________________

## 7) Manage payouts behavior

- [ ] **Expected behavior:** If payouts incomplete, `Continue setup` opens payouts onboarding UI.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** If payouts ready, `Manage payouts` opens payouts management flow.  
  **Notes:** ______________________________________________

## 8) Recommended setup actions

- [ ] **Expected behavior:** `Profile photo` action routes to seller profile page.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** `Bio` action routes to seller profile page.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** `Favorite categories` action routes to listings view.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** `Banner image` and `Social links` are clearly marked not built yet (intentional disabled state).  
  **Notes:** ______________________________________________

## 9) Seller navigation (no dead tabs)

- [ ] **Expected behavior:** `Home` routes to `/account/seller`.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** `Listings` routes to `/account/listings`.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** `Orders` routes to `/account/sales`.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** `Messages` routes to `/account/messages`.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** `Live` routes to `/seller/live`.  
  **Notes:** ______________________________________________

## 10) Layout checks

### Small mobile (iPhone SE width)
- [ ] **Expected behavior:** Hero buttons stack cleanly, no clipped labels or overlap.  
  **Notes:** ______________________________________________

- [ ] **Expected behavior:** Setup and card actions remain tappable and readable.  
  **Notes:** ______________________________________________

### iPhone 14/15 width
- [ ] **Expected behavior:** Cards and nav chips remain balanced; no awkward wrapping.  
  **Notes:** ______________________________________________

### Desktop
- [ ] **Expected behavior:** Hero hierarchy, card spacing, and nav treatment look polished and easy to scan.  
  **Notes:** ______________________________________________

