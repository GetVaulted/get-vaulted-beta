# Legal, Compliance & Marketplace Policy Audit — July 2026

Scope: Terms of Service, Privacy Policy, Marketplace Compliance, Payments & Financial Compliance,
Live Commerce, User Generated Content, Apple App Store Compliance, Google Play Compliance,
Accessibility, Consumer Protection, and Operational Compliance. US launch, future international
expansion assumed. This audit does not re-litigate the separate security (`security-audit-2026-07.md`)
or performance (`performance-audit-2026-07.md`) audits except where a finding creates a legal or
compliance issue.

**This is technical/policy research performed by an engineering agent, not legal advice.** Every
item below is either (a) fixed in code/docs as a factual correction, or (b) flagged as
**REQUIRES OWNER LEGAL REVIEW** for a human attorney to decide. Nothing here should be treated as
a substitute for qualified counsel before launch.

---

## Critical launch blockers (fixed)

| # | Finding | Fix |
|---|---|---|
| 1 | ToS described marketplace timed auctions that are disabled in code; live auctions and Buy Now were misrepresented | `web/src/app/terms/page.tsx` §1, §4 rewritten to describe actual formats |
| 2 | Reserve-price "met" indicator compared the bid to the lot's **starting price**, not its **reserve price** — reserve status shown to hosts/viewers was effectively always wrong | Fixed in `VaultPinnedLot.tsx` (web) and `VaultPinnedLotCard.tsx` (mobile); logic extracted to tested pure functions |
| 3 | "Vault Verified" trust badge (shield-checkmark, implies authentication) was driven by `vaultPick` — a flag any seller can self-set at listing creation — on mobile, web listing pages, and the web trust panel | Badge now driven by the seller's real backend-computed trust tier (`sellerLevel === "vault_verified" \| "elite_vault_verified"`) everywhere |
| 4 | Buyer-facing "Response time" and "Ship on time %" stats, and seller "sales count" / "watching" counts, were **random numbers derived from a hash of the username/listing id** — fabricated statistics presented as real performance data | Fabricated fields removed; sales/watching counts now come from real `Order`/`WatchlistItem` queries with an honest "New to Get Vaulted" / 0 zero-state |
| 5 | No DMCA notice-and-takedown / counter-notice / repeat-infringer policy existed anywhere on the platform — a UGC marketplace has no safe-harbor protection under 17 U.S.C. §512 without one | New `/dmca` page added; cross-linked from ToS, Community Guidelines, footer. **Owner must still register a Designated Agent with the US Copyright Office before this provides safe-harbor protection — placeholder contact info is clearly marked.** |

## High-risk compliance issues

**Fixed:**
- Sentry was integrated for error monitoring/session replay but **not disclosed** as a subprocessor in the Privacy Policy — added.
- Account deletion left `PushDeviceToken` rows behind (a deleted user could still be pushed to) — deletion now also revokes push tokens.
- ToS never disclosed actual fees (8% marketplace, 8/7.25/6.5% live tiers, $12–45 trade fees), the 7-day default payout hold, or that payouts run through Stripe Connect **Express** accounts — all added to ToS §5.8.
- ToS never disclosed that marketplace (Buy Now/offer) orders have **no structured refund tool** (only live-show orders have the 2-day refund/return panel; only escrow trades have the dispute tool) — added to ToS §6 and corrected across 4 help-center articles that implied a universal refund/dispute system.
- Help Center's "Seller ratings and reviews" article described a full review system (leave a review, seller profile shows aggregate ratings) that **does not exist anywhere in the codebase** (no `Review` model, no review API). Rewritten to state accurately what trust signals exist today. Same overstatement corrected in Community Guidelines §10 and ToS §1/§11 ("ratings"/"reviews" removed from feature lists and prohibited-conduct list where they described a nonexistent system).
- No Prohibited Items policy existed as a standalone, linkable page (only scattered ToS/guidelines bullets) — new `/prohibited-items` page added and cross-linked.
- Live commerce mechanics (bid irrevocability, proxy/max bidding, minimum increments, soft-close/sudden-death modes, host skip/cancel of lots without an automatic-refund guarantee, Vault Wallet auto-charge authorization, and settlement/charge timing differences by room type) were entirely undisclosed in the ToS — new "Live auction mechanics," "Settlement and charge timing," and "Host cancellation" paragraphs added to ToS §7; binding-transaction language added to §4.
- No appeals mechanism existed for moderation/account actions (zero code or policy references) — a minimal Appeals section added to Community Guidelines (§12) directing users to email support for case-by-case review; this does **not** create a formal SLA or guaranteed-reversal right.

**Documented for owner review (not fixed — requires a legal/product decision, not a mechanical bug fix):**
- **Arbitration clause** lacks a named provider (AAA/JAMS), governing rules, and an opt-out window — enforceability risk. Needs counsel-drafted arbitration language.
- **Governing law (Texas)** should be confirmed against the actual LLC formation state/registered agent.
- **Whether reserve-not-met lots can still be sold** at settlement (host discretion vs. hard block) is a live-auction product-policy decision, not a bug — `web/src/lib/live-room-item-unit-sale.ts` currently allows a sale to proceed regardless of reserve status once the host acts.
- **GDPR readiness** (lawful basis statement, EU representative/DPO, data-subject rights beyond CCPA, SCCs for international transfers) — needed only if/when EU users are onboarded, per the "future international expansion" assumption.
- **Age verification / COPPA**: no DOB collection at signup on web or mobile despite an 18+ policy claim. Adding a DOB field is a product change, not something this pass implemented blindly.
- **Full account-deletion erasure**: deletion currently anonymizes the `User` row but does not delete `Address` rows referenced by historical orders (Order has no independent shipping snapshot, so deleting those addresses would erase financial/shipping records tied to completed orders) or scrub chat/messages. A real fix requires deciding a retention policy for financial records vs. erasure rights — flagged rather than blindly deleted.
- **Cookie consent banner** for EU/UK ePrivacy compliance (Sentry session replay, any future analytics) — not built; only relevant once EU traffic is expected.
- **Giveaway/sweepstakes compliance**: AMOE (`/promo-entry/[slug]`) infrastructure exists in code, but the current UI shows entrants only "[Official rules on file]" rather than surfacing the AMOE link prominently, and official-rules text needs counsel review (NPN/odds/prize ARV/void-where-prohibited) before scaling purchase-linked giveaways.
- **Upload content scanning**: no NSFW/malware scanning on listing photos, videos, or avatars beyond MIME/size/magic-byte checks — a real engineering investment, not a doc fix.
- **Incident response / breach notification plan** and **internal law-enforcement request procedure**: neither exists in `web/docs/`. Needed as an operational (not code) deliverable before launch.
- **Trademark/licensing exposure**: platform UI uses real NFL/NBA/MLB team names and colors in reveal wheels/board sets (`web/src/lib/nfl-team-colors.ts`, `team-board-sets.ts`) — needs a licensing determination from counsel (fair-use/nominative-use argument vs. formal license).

## Medium/low issues

- Trade Center fee disclosure in ToS says "disclosed weight tiers"; code (`mobile/src/lib/tradeFeeAmounts.ts`) has specific dollar amounts now also reflected in ToS §5.8.
- `pay-fees` help-center article remains intentionally general (defers to order breakdowns) — left as-is since it makes no false claims.
- No self-service data export/portability tool (CCPA "right to know" is served manually via support today) — acceptable for a US-only launch, flagged for growth.
- No "Do Not Sell/Share" link or GPC signal handling — low risk since Privacy Policy already states no sale/sharing of data, but should be added for CCPA optical compliance as the platform scales.
- Record retention schedule (by data/record type) is qualitative in the Privacy Policy only; no internal written schedule exists.
- AML/OFAC/sanctions screening reliance on Stripe Connect is an appropriate marketplace posture but should be memorialized in an internal one-page compliance memo (no code change needed).
- Seller-level "Vault Verified" wording still appears in a handful of pure-marketing copy strings (e.g., mobile home-feed pulse copy, trade hero chip) that are not tied to a specific listing's authenticity claim — lower risk than the fixed per-listing badges, but worth a copy pass if the badge system is renamed later.

## Files changed

**Code:**
- `web/src/lib/account-deletion.ts` (+ new `account-deletion.test.ts`) — revoke push tokens on deletion
- `web/src/app/privacy/page.tsx` — Sentry subprocessor disclosure
- `mobile/src/api/mapWebMarketplaceListing.ts` (+ test) — Vault Verified now driven by real seller tier
- `web/src/lib/marketplace-item-trust.ts` (+ new test) — removed fabricated response-time/ship-% stats; Vault Verified fixed
- `web/src/lib/marketplace-item-extras.ts` (+ new test) — removed fabricated watching/sales-count generators; real signals threaded through
- `web/src/app/listing/[id]/page.tsx`, `web/src/app/seller/[username]/page.tsx` — wired real watchlist/order counts
- `web/src/components/marketplace/MarketplaceItemTrustVault.tsx`, `MarketplaceItemConfidenceStrip.tsx` — removed fabricated stats/unconditional "Verified seller"
- `web/src/components/break-host/vault/VaultPinnedLot.tsx` (+ new test) — reserve-met fixed, extracted `computeLiveLotReserveMet`
- `mobile/src/components/seller/liveConsole/VaultPinnedLotCard.tsx`, new `mobile/src/lib/liveLotReserveStatus.ts` (+ test) — same fix on mobile
- `web/src/app/terms/page.tsx` — auction language, fee/payout/refund/live-mechanics disclosures, IP/prohibited-items cross-links
- `web/src/app/community-guidelines/page.tsx` — reviews honesty fix, Appeals section, DMCA/Prohibited Items cross-links
- `shared/help-center-articles.ts` — corrected `mkt-browse`, `mkt-verified`, `trust-verified`, `trust-reviews`, `disp-when`, `disp-open`, `disp-refund`
- `web/src/components/layout/SiteFooter.tsx` — added Prohibited Items / DMCA links

**New policy pages:**
- `web/src/app/dmca/page.tsx`
- `web/src/app/prohibited-items/page.tsx`

**Tests added:** `account-deletion.test.ts`, `mapWebMarketplaceListing.test.ts` (extended), `marketplace-item-trust.test.ts`, `marketplace-item-extras.test.ts`, `VaultPinnedLot.test.ts`, `liveLotReserveStatus.test.ts` — 24 new/extended test cases, all passing. Full suite: 875/875 web tests, 336/336 mobile tests, clean `tsc --noEmit` on both apps.

## Policies updated
Terms of Service, Privacy Policy, Community Guidelines, and 7 Help Center articles (see above); 2 new policies published (DMCA/Copyright, Prohibited Items).

## Remaining legal decisions requiring owner approval
1. Register a DMCA Designated Agent with the US Copyright Office and replace the placeholder contact on `/dmca`.
2. Finalize arbitration provider/rules/opt-out language with counsel.
3. Confirm governing-law state matches LLC formation.
4. Decide whether unmet-reserve lots may still be sold at host discretion, and whether that needs its own disclosure.
5. Decide age-verification approach (DOB field, attestation-only, or ID check) given the 18+ policy claim.
6. Decide account-deletion retention policy for addresses/messages tied to historical orders vs. full erasure.
7. Legal review of `/prohibited-items` list for completeness/jurisdiction fit, and giveaway official rules before scaling purchase-linked giveaways.
8. Trademark/licensing position on real sports-league team names/colors used in product UI.
9. GDPR/international-expansion readiness (DPO, SCCs, cookie consent) — timeline can follow the "US-first" launch plan, but should not be deferred indefinitely once EU users are targeted.
10. Incident-response/breach-notification plan and law-enforcement request playbook (operational documents, not code).

## Final recommendation

**Launch with monitoring.**

The most acute legal-exposure items — misrepresented auction terms, a broken reserve-price indicator on live money-moving transactions, a badge system that let sellers self-certify "verification," and fabricated performance statistics shown to buyers — have been fixed and covered by regression tests, with zero test/typecheck regressions across both apps. A DMCA policy and Prohibited Items policy now exist where none did before.

What remains is a list of genuine legal-judgment calls (arbitration terms, age verification, data retention, giveaway rules, trademark licensing, GDPR readiness) that a script should not decide unilaterally. None of them are launch-blocking for a US-only beta/launch by themselves, but items 1–4 in the "remaining legal decisions" list above should be resolved by counsel **before** wide marketing spend or scaling live giveaways/box breaks, since they carry the highest per-incident exposure (safe-harbor loss, unenforceable arbitration, sweepstakes-law violations).
