# Vaulted Live Real-Device QA Checklist (Buyer + Seller)

Last updated: 2026-05-07

## Purpose
This checklist is for hands-on QA on real phones before continuing UI/UX build-out. It focuses on **layout polish**, **premium consistency**, and **realtime correctness** for:

- Buyer live room (`/live/[id]`) — sale + auction variants
- Seller/host live console (`/seller/live/[roomId]/console`)

## Recommended test setup (fast path)
1. Prepare **one Seller device** and **one Buyer device** logged into the **same live room** (use staging if available).
2. Prefer testing on **two simultaneous connections** when validating realtime sync (viewer count, bid, chat, active item).
3. Have a short “script” ready for the host actions:
   - Add item(s) → set active item → start auction → bid flow → end auction → sold/skip → purchase flow (if applicable).

--- 

## 1) Buyer mobile live screen

### A. No auction live
- [ ] Stage + top overlay are readable (no clipping on small widths)
- [ ] Bottom safe-area spacing: chat overlay and any bottom sheets do not overlap the iOS home indicator / Android nav bar
- [ ] Right-side action rail (Share / Wallet / Shop) is reachable and not obscured by chat or bid sheet
- [ ] Buyer can open chat overlay and type (keyboard does not permanently push UI off-screen)
- [ ] Wallet button navigates correctly and returns to the live room cleanly
- [ ] Share button triggers share (native share or copy) without layout breaking
- [ ] Live viewer pill renders without layout jitter

### B. Auction live (buyer sees active item)
- [ ] Active item title + bid/price text hierarchy is clear (no random font jumps / truncation is clean)
- [ ] Timer/countdown appears correctly and remains legible
- [ ] Countdown loop feels urgent but not distracting (especially last ~10 seconds)
- [ ] Buyer bid CTA is reachable and shows correct enabled/disabled state
- [ ] Bid button pressed state feels responsive (no “dead” tap)
- [ ] Out-of-date states do not occur (e.g., buyer sees “Ended” only after host ends)

### C. Bid placed (winning / non-winning path)
- [ ] On bid submit: UI shows immediate loading (“Placing…”) and blocks double-submit
- [ ] Bid confirmation: buyer sees their high bid reflected in the correct place
- [ ] If not winning: buyer still sees correct current highest bid
- [ ] No duplicate bid events after refresh/reconnect

### D. Outbid state
- [ ] Outbid toast appears (or equivalent outbid feedback) and does not obscure chat input
- [ ] Buyer’s winning state is revoked correctly
- [ ] Timer continues smoothly; no jitter or sudden layout shifts

### E. Winning state
- [ ] Winning label (“You’re winning” or equivalent) appears only when appropriate
- [ ] Winning styling is subtle (premium) and does not create excessive glow
- [ ] Bid CTA remains consistent and doesn’t visually contradict the state

### F. Auction ended
- [ ] Countdown stops and timer text doesn’t freeze in an inconsistent style
- [ ] Bid button becomes disabled (or changes to correct “Ended” state)
- [ ] Late bids are rejected reliably (no “success” UI for rejected bids)
- [ ] Final winning/highest bid is consistent everywhere in the UI

### G. Item sold (post-end sync)
- [ ] Buyer sees sold state / sold activity reflects correctly
- [ ] Buyer’s chat receives system messages for sale completion (if applicable)
- [ ] Any post-sale overlays/sheets align with safe-area spacing

### H. Chat send/receive
- [ ] Send a chat message and confirm it appears in conversation
- [ ] Newest message animation is present but not distracting
- [ ] Chat input placeholder + focus behavior works on iOS/Android browsers
- [ ] System notices (auction started/ended, purchases, sold states) are visible

### I. Wallet button
- [ ] Tap Wallet and confirm navigation
- [ ] Return to live room: state is not corrupted / message list is not duplicated

### J. Share button
- [ ] Tap Share:
  - [ ] Native share sheet opens OR
  - [ ] Link copy succeeds
- [ ] UI stays stable after returning from share flow

### K. Right-side action rail
- [ ] Share / Wallet / Shop are visible and tappable at rest
- [ ] Rail does not overlap chat overlay or bid controls
- [ ] Rail respects reduced-motion behavior (no unexpected animations)

### L. Top overlay readability
- [ ] Host name + verified pill + status pill remain readable on:
  - iPhone SE / small widths
  - tall phones (narrow + tall)
- [ ] No clipping/ellipsis overlap with follower button / rating

### M. Bottom safe-area spacing
- [ ] Chat overlay bottom positioning respects safe-area
- [ ] Bottom sheet / modal content is not hidden behind home indicator / nav bar
- [ ] Scrolling inside sheets works (no trapped scroll / no body scroll bleed)

--- 

## 2) Seller / host mobile screen

### A. Go live
- [ ] Seller can start live (CTA available, disabled state is correct until readiness passes)
- [ ] Live console loads without overlay misalignment
- [ ] Seller sees correct viewer count pill and room status

### B. End live
- [ ] End live action works and transitions smoothly
- [ ] Buyer experiences switch to ended state reliably
- [ ] No “double tap” causes inconsistent states

### C. Add item
- [ ] Queue item add form is usable on small screens (no input clipping)
- [ ] Added item appears in queue list
- [ ] Item thumbnail / title truncation remains clean

### D. Set active item
- [ ] Selecting a queue row updates the active indicator correctly
- [ ] Active item overlay updates on both seller and buyer
- [ ] No “stale active” mismatch after reconnect

### E. Start auction
- [ ] START action changes room to auction live state
- [ ] Buyer sees timer + active item updates quickly
- [ ] Buyer bid button becomes enabled at the right time

### F. End auction
- [ ] END ends auction state across seller + buyer
- [ ] Late bids rejected
- [ ] UI reflects correct ended/sold transition sequence

### G. Mark sold
- [ ] Mark sold updates the correct row + sold activity visibility
- [ ] Buyer sees sold state / purchase completion sync as designed
- [ ] System notices appear (if your flow emits them)

### H. Queue controls
- [ ] Queue sheet layout:
  - Add queue lot
  - Rows show status, high bid, and claim info (if applicable)
- [ ] Row highlight/selection feels consistent with premium styling
- [ ] Tap targets are comfortably sized for thumb use

### I. Chat visibility
- [ ] Chat messages are visible and readable
- [ ] Buyer messages appear on seller promptly
- [ ] Seller sees system notices (auction start/end, sold/purchase events)
- [ ] Chat input does not conflict with bottom nav/sheet

### J. Buyer bid visibility
- [ ] When buyer bids, seller sees updated high bid / current winning state
- [ ] Outbid events aren’t misleading on the seller side

### K. System notices
- [ ] Ephemeral notices (success/failure, outbid, started/ended) display:
  - correct copy
  - correct duration
  - correct placement (not covering critical UI)

### L. Bottom nav safe area
- [ ] Bottom nav is always visible and tappable
- [ ] Safe-area spacing prevents nav from sitting under gesture areas
- [ ] Opening bottom sheets doesn’t permanently cut off content

--- 

## 3) Device matrix (test at least these)

Use checkboxes and record results per device.

### iOS
- [ ] iPhone SE / small width (portrait)
- [ ] iPhone 14/15 (portrait)
- [ ] iPhone Pro Max (portrait)

### Android
- [ ] Android tall screen (e.g., 20:9, gesture nav)
- [ ] Android small screen (portrait)

For each tested device, also note:
- Browser/WebView: Safari / Chrome / in-app browser
- OS version

--- 

## 4) Network conditions

Validate realtime UX under common network variability.

- [ ] Strong WiFi
- [ ] Weak WiFi (low RSSI or throttled)
- [ ] LTE/5G

Reconnect / background tests:
- [ ] Reconnect after airplane mode (1–2 min offline, then return)
- [ ] Background app or browser for 30–60 seconds then resume
- [ ] While offline: confirm UI shows no permanent “stuck” state

Record for each:
- time-to-recover for viewer count/chat/bid sync
- any duplicated events after reconnect

--- 

## 5) Realtime checks (correctness + duplication)

Run these as a short “realtime verification loop” using 1 seller + 1 buyer:

### Core realtime
- [ ] Viewer count accuracy:
  - viewer count increments when buyer joins
  - viewer count decrements when buyer leaves
- [ ] Chat latency:
  - time from send → appears on other device
- [ ] Bid latency:
  - time from bid → reflects on the other device
- [ ] Active item sync:
  - seller set active item → buyer overlay updates quickly
- [ ] Auction start/end sync:
  - START/END actions update buyer UI state in consistent order
- [ ] Purchase_completed sync:
  - after checkout completion, sold/purchased states appear correctly

### Anti-duplication
- [ ] No duplicate events after reconnect:
  - re-enter room after disconnect
  - confirm chat doesn’t duplicate previous messages
  - confirm bid/outbid/sold toasts aren’t replayed incorrectly

--- 

## 6) Acceptance criteria (pass/fail)

Use these criteria consistently; if a single “critical” item fails, mark overall as **Fail**.

### UI layout (Critical)
Pass if:
- All critical UI remains readable and tappable on each device in the matrix
- No overlapping UI between:
  - chat overlay
  - bid sheet / bottom sheet controls
  - safe-area gesture areas
Fail if:
- Any text is clipped/unreadable at default zoom
- Any CTA becomes unreachable without scrolling unexpectedly

### Bid flow (Critical)
Pass if:
- Bid submit results in consistent high-bid state on both seller + buyer
- Busy/loading state prevents double-submit
- Late bids after END are rejected with correct UI feedback
Fail if:
- The same bid is applied twice, or winner is inconsistent across devices

### Chat (High)
Pass if:
- Send/receive works reliably with no lost messages
- System notices appear and don’t spam
Fail if:
- Messages duplicate after reconnect or arrive out-of-order in a confusing way

### Viewer count (High)
Pass if:
- Viewer count matches expected increments/decrements reliably
Fail if:
- Viewer count becomes stuck or differs materially (> few viewers) after reconnect

### Seller controls (Critical)
Pass if:
- START/END/Add/Set Active/Sold actions work reliably
- Seller sees buyer bid updates as expected
Fail if:
- Any control fails or updates the wrong item/status

### Reconnect recovery (Critical)
Pass if:
- After airplane-mode reconnect, buyer and seller recover within a short window
- No duplicate toasts/events that break the user’s next action
Fail if:
- Critical state (auction ended, sold, winning bid) is incorrect after reconnect

### Performance (Medium)
Pass if:
- No major jank during message arrival, countdown state changes, or sheet open/close
- No animation causes noticeable layout thrashing on small widths
Fail if:
- Visible stutters that consistently impact usability

--- 

## QA sign-off template (optional)
- Tester:
- Date:
- Room id:
- Devices:
- Network profile(s):
- Notes / screenshots:
- Overall: Pass / Fail

