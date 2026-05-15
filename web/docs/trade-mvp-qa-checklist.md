# Trade MVP QA Checklist

Use this checklist before release and after major trade-related changes.

## Listing setup and CTA

- [ ] Create/edit listing shows `Accept trade offers` toggle and persists after save.
- [ ] Listing with toggle ON and active status shows `Start trade offer` CTA for non-owner.
- [ ] Listing with toggle OFF hides trade CTA.
- [ ] Own listing never shows trade CTA.
- [ ] Sold/unavailable listings do not show a trade CTA.

## Trade hub (`/trade`)

- [ ] Signed-out user sees page content and CTA links route to sign-in with return path.
- [ ] Signed-in user can open `Start a Trade` and `View Trade Offers`.
- [ ] Placeholder copy is visible: verified trades coming soon.

## Trade builder (`/trade/new`) blank flow

- [ ] Signed-out access redirects to sign-in with `returnTo=/trade/new`.
- [ ] Requested picker allows only trade-enabled active listings and blocks mixed sellers.
- [ ] Offered picker shows only viewer-owned eligible listings.
- [ ] Enforces 1-5 items per side.
- [ ] Cash adjustment allows one direction only and non-negative values.
- [ ] Submit button shows loading state and handles inline errors cleanly.

## Trade builder prefill (`/trade/new?listingId=...`)

- [ ] Valid trade-eligible listing preselects in requested side.
- [ ] Missing listing shows actionable error with safe links.
- [ ] Own listing prefill is blocked with clear message.
- [ ] Non-trade-enabled or unavailable listing prefill is blocked with clear message.

## Offer creation and management

- [ ] Successful create redirects to `/trade/[id]`.
- [ ] Offer detail shows snapshots for both sides, value summary, timeline, and actions.
- [ ] Received tab includes offers where viewer is recipient.
- [ ] Sent tab includes offers where viewer is proposer.
- [ ] Active/completed/declined-expired filters behave as expected.

## Actions: accept / decline / counter / cancel

- [ ] Recipient can accept and decline while offer is active (`pending`/`countered`).
- [ ] Proposer can cancel while offer is active.
- [ ] Participants can counter while offer is active.
- [ ] Non-participants cannot access offer details or mutate offer status.
- [ ] Action errors are user-friendly and do not expose internal details.

## Expiration and duplicate protection

- [ ] Expired offers auto-transition to `expired` on read/action paths.
- [ ] Expired offers cannot be accepted/declined/cancelled/countered.
- [ ] Duplicate active offer for same proposer/recipient/target listing is blocked with 409 message.
- [ ] Rapid create/counter attempts return friendly rate-limit responses.

## Mobile QA

- [ ] `/trade`, `/trade/new`, `/trade/offers`, `/trade/[id]` are readable and tappable on iPhone SE width.
- [ ] Sticky submit area on builder remains usable and does not hide critical controls.
- [ ] Offer filters are horizontally scrollable and easy to tap.
- [ ] Long item titles/messages wrap without clipping.

## Auth redirects

- [ ] `/trade/new` redirects unauthenticated users to sign-in with preserved return target.
- [ ] `/trade/offers` redirects unauthenticated users to sign-in with preserved return target.
- [ ] `/trade/[id]` redirects unauthenticated users to sign-in with preserved return target.
