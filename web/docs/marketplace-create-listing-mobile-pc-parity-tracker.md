# Marketplace create listing — mobile → PC parity tracker

**Purpose:** Track mobile-only work in this branch so it can be ported to Seller Studio (web/PC) when mobile is finished.

**Last updated:** 2026-06-28  
**Mobile status:** In progress (uncommitted local changes)  
**PC status:** Not started — web still uses legacy `CreateListingPage.tsx` shipping UX

---

## How to use

1. Finish and test mobile create listing flow.
2. Commit mobile changes (or note commit SHA here).
3. Work through each section below — port behavior to the **Web target** files.
4. Check off **PC done** when web matches mobile behavior.
5. Run cross-client QA using `web/docs/cross-client-sync-qa.md` where relevant.

---

## Quick summary

| Area | Mobile | PC (web) | Notes |
|------|--------|----------|-------|
| Shipping profiles on create listing | ✅ | ☐ | Mobile loads Seller HQ profiles + prefills parcel |
| Package weight & size grouped | ✅ | ☐ | Single card on mobile |
| Ship-to ZIP removed (seller step) | ✅ | ☐ | Buyer address used at checkout/view |
| Buyer shipping options (3 modes) | ✅ | ☐ | All / No overnight / Pick carriers |
| Pricing: 8% platform fee copy | ✅ dynamic | ☐ | Fetches `/api/platform/marketplace-fee` |
| Pricing: estimated payout card | ✅ dynamic | ☐ | Uses live fee % from admin |
| **Admin: editable marketplace fee** | ✅ API + UI | ✅ | `/admin/fees` + DB config |
| Listing AI assistant off | ✅ | ☐ | Feature flags + UI gates |
| Pricing assistant off | ✅ | ☐ | Separate flag |
| Live in-app share | ✅ mobile | ◐ partial web | Not create-listing; host/buyer share sheets |
| Shipping profile API auth (Bearer) | ✅ shared API | ✅ shared API | Shipped earlier (build 66) |

---

## 1. Shipping preferences step (marketplace only)

**Mobile behavior**

- Screen: `mobile/src/screens/createListing/CreateListingShippingScreen.tsx`
- Loads seller shipping profiles via `fetchSellerShippingProfiles` (`mobile/src/api/liveHostShippingRepository.ts`)
- Auto-selects profile from listing category (`mobile/src/createListing/marketplaceShippingProfile.ts`)
- Selecting a profile prefills weight (lb/oz) + dimensions (L×W×H)
- **Package weight & size** in one card (not split across the screen)
- **Ship-from ZIP** from seller account (or manual if missing)
- **Ship-to ZIP removed** — preview uses ship-from only; buyers get live quotes at checkout
- **Buyer shipping options** (radio):
  - **All services** — every carrier lane Shippo returns
  - **No overnight / next-day air** — hides express lanes (heuristic)
  - **Pick carriers** — carrier chips only shown for this mode
- Live rate preview reflects selected scope; overnight lanes marked excluded when applicable
- Publish requires profile (when profiles load), parcel complete, and ≥1 offerable carrier lane

**Mobile files (modified/new)**

| File | Change |
|------|--------|
| `CreateListingShippingScreen.tsx` | Major UX + scope/carrier logic |
| `marketplaceShippingProfile.ts` | **NEW** — profile → parcel fields, category mapping |
| `types.ts` | `marketplaceSellerShippingProfileId`; removed `shipToZip` |
| `liveHostShippingRepository.ts` | Profile type includes weight/dimension fields |
| `shippoRates.ts` | Publish guard: custom scope needs carriers, not rate keys |
| `createListingStepsPartB.tsx` | Review block shows profile + parcel summary |

**Web target (PC parity)**

| File | What to do |
|------|------------|
| `web/src/components/sell/CreateListingPage.tsx` | Replace shipping preset UX with seller profile picker + grouped parcel card |
| `web/src/app/api/account/seller/shipping-profiles/route.ts` | Already returns profile dimensions — reuse |
| `web/src/lib/marketplace-shipping-offer.ts` | Align scope + carrier filter logic with mobile `shippoRates.ts` |
| `web/src/app/api/listings/route.ts` | Accept `marketplaceShippingOfferScope`, `marketplaceAllowedCarriers` from form (partially exists) |

**PC done:** ☐

---

## 2. Pricing step — fee % and payout estimate

**Mobile behavior**

- Platform fee shows **8%** (from `VAULTED_PLATFORM_FEE_PERCENT` in `sellerOrderPayoutDisplay.ts`)
- **Estimated payout card** when price > 0 and not `trade_only`:
  - Get Vaulted fee, card processing estimate, estimated payout
- Component: `mobile/src/createListing/ListingPricingPayoutCard.tsx`
- Helper: `estimateListingPayoutFromItemPrice()`, `resolvePricingItemPriceUsd()` in `createListingReviewDisplay.ts`

**Mobile files**

| File | Change |
|------|--------|
| `createListingStepsPartB.tsx` | Pricing screen + payout card |
| `ListingPricingPayoutCard.tsx` | **NEW** |
| `sellerOrderPayoutDisplay.ts` | Payout estimate helpers |
| `createListingReviewDisplay.ts` | `resolvePricingItemPriceUsd` |

**Web target**

| File | What to do |
|------|------------|
| `web/src/components/sell/CreateListingPage.tsx` | Pricing section: 8% fee + payout breakdown card |
| `web/src/lib/seller-order-payout-display.ts` (or equivalent) | Share or mirror payout math |

**PC done:** ☐

---

## 3. AI listing assistant — disabled (marketplace)

**Mobile behavior**

- `MARKETPLACE_LISTING_AI_ENABLED = false` in `listingAiAssistantEnabled.ts`
- Hides FAB, media scan suggestions, field badges, review ack gates on **marketplace** create flow only
- Live show create path unchanged

**Mobile files**

| File | Change |
|------|--------|
| `listingAiAssistantEnabled.ts` | **NEW** flags |
| `CreateListingChrome.tsx` | Gates assistant chrome |
| `createListingStepsPartA.tsx` | Gates scan/banners |
| `createListingStepsPartB.tsx` | Gates badges/review |
| `CreateListingDraftContext.tsx` | Gates assistant init |

**Web target**

| File | What to do |
|------|------------|
| `web/src/components/sell/CreateListingPage.tsx` | Hide/disable any AI assistant UI if present |
| Or add `web/src/lib/listing-ai-assistant-enabled.ts` | Same flags for web |

**PC done:** ☐

---

## 4. Pricing assistant — disabled (marketplace)

**Mobile behavior**

- `LISTING_PRICING_ASSISTANT_ENABLED = false`
- Hides pricing suggestion card on pricing step + review “AI suggested” line
- Mock scan skips `aiSuggestedPrice`; assistant chat gives “paused” reply for price prompts

**Mobile files**

| File | Change |
|------|--------|
| `listingAiAssistantEnabled.ts` | `listingPricingAssistantEnabled()` |
| `createListingStepsPartB.tsx` | Gates pricing card |
| `mockAiListingScan.ts` | Skips price fields |
| `listingAssistantReplies.ts` | Price prompt copy |

**Web target**

| File | What to do |
|------|------------|
| Web create listing (if pricing AI exists) | Same flags / hide UI |

**PC done:** ☐

---

## 5. Buyer live shipping at view/checkout (already shared — verify only)

**Not part of create listing**, but related to removing ship-to on seller step:

| Surface | Status |
|---------|--------|
| Web checkout `BuyNowCheckoutForm` + `/api/checkout/shipping-rates` | ✅ Live Shippo (seller ship-from + buyer address) |
| Mobile checkout `MarketplaceCheckoutScreen` | ✅ Same API |
| Web PDP `MarketplaceItemShippingEstimateLine` + `/api/listings/[id]/shipping-estimate` | ✅ Signed-in + saved address |
| Mobile PDP | ☐ No live estimate yet — static “calculated at checkout” |

**Optional follow-up (mobile PDP, not PC create listing):** Wire mobile item detail to shipping-estimate API.

---

## 6. Other mobile changes in this branch (not create listing)

These are tracked for completeness; **PC parity may already exist or differ by design.**

### In-app live room share

| Mobile | Web |
|--------|-----|
| `LiveRoomShareSheet.tsx`, `liveRoomShareRepository.ts` | `LiveRoomShareSheet.tsx`, `share-in-app` API |
| Wired: `VerticalLiveFeed`, `SellerLiveHostView` | Wired: break/auction/sale host consoles |

**PC done:** ◐ (web host consoles have sheet; verify parity with mobile)

### Seller console copy

| Mobile | Web |
|--------|-----|
| `sellerConsoleCopy.ts` | `seller-console-copy.ts` |

**PC done:** ☐ verify sync

### Shipping profiles auth (mobile Bearer)

| API | Status |
|-----|--------|
| `web/src/app/api/account/seller/shipping-profiles/route.ts` | ✅ `resolveAccountSellerUserId` — works for mobile + web |

---

## 7. Form / API fields to persist on publish (marketplace)

Ensure web publish payload matches mobile when porting:

```ts
// Already on Listing model / listings API
marketplaceShippingOfferScope: 'all' | 'no_overnight' | 'custom'
marketplaceAllowedCarriers: string[]
marketplaceAllowedRateKeys: string[]  // mobile uses carriers-only for custom; keys optional
parcelWeightOz, parcelLengthIn, parcelWidthIn, parcelHeightIn
shippingPriceUsd: 0  // carrier-calculated

// Mobile draft only (consider persisting later)
marketplaceSellerShippingProfileId: string | null  // not yet sent on publish
```

---

## 8. Suggested PC implementation order

1. Shipping profiles + grouped parcel + remove ship-to on seller form  
2. Buyer shipping options (3 modes) + carrier chips for Pick carriers  
3. Pricing fee 8% + payout estimate card  
4. AI / pricing assistant flags (if web has equivalent UI)  
5. Cross-client QA on publish → checkout rates  

---

## 9. Commit checklist (fill in when mobile is done)

- [ ] Mobile changes committed — SHA: `________`
- [ ] Mobile build tested (create listing → publish → buyer checkout rates)
- [ ] PC parity work started
- [ ] PC parity complete
- [ ] Tracker archived or merged into release notes

---

## Reference: primary web file to refactor

**`web/src/components/sell/CreateListingPage.tsx`** — single large form; shipping section ~lines 1350–1500 uses legacy presets, always `marketplaceShippingOfferScope: "all"`, split parcel fields in advanced panel.

Mobile equivalent: **`mobile/src/screens/createListing/CreateListingShippingScreen.tsx`** + **`createListingStepsPartB.tsx`** (pricing/review).
