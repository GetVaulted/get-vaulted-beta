# Mobile Live Experience

## Scope

Implemented mobile-first live UX updates for:

- Buyer live room (`/live/[id]`) sale + auction variants
- Seller live console (`/seller/live/[roomId]/console`)
- Shared mobile bottom sheet behavior

Desktop/tablet layouts were preserved.

## Buyer Mobile Layout

Updated files:

- `src/components/live-auction/LiveSaleRoom.tsx`
- `src/components/live-auction/LiveAuctionRoom.tsx`
- `src/components/ui/MobileBottomSheet.tsx` (new shared component)

Behavior on mobile (`lg` and below):

- Stage remains full-screen-first with top live chrome from `LiveVideoStage`.
- Primary bid/buy action stays in stage mobile overlay for thumb reach.
- Added persistent bottom mobile nav with:
  - `Queue`
  - `Chat`
  - `Info`
  - `Sales`
- Each item opens a bottom sheet (no page navigation).
- Chat and queue no longer rely on squeezed inline desktop panels.
- Bottom nav + sheet include safe-area padding.

## Seller Mobile Console Layout

Updated file:

- `src/components/break-host/BreakHostConsole.tsx`

Behavior on mobile (`lg` and below):

- Desktop side columns (`queue`, `chat`) are hidden.
- Stage remains primary surface.
- Added quick host control row under stage:
  - `START` (green)
  - `PASS` (maps to `skipped`)
  - `END` (red)
- Added bottom mobile nav:
  - `Controls`
  - `Queue`
  - `Chat`
  - `Sales`
  - `More`
- Each nav item opens a bottom sheet:
  - Controls sheet includes START/END/PASS and increment chips (`+$5`, `+$10`, `+$25`, `+$50`).
  - Queue sheet supports quick item selection.
  - Chat sheet includes messages + system broadcast input.
  - Sales sheet shows recent sales/hit activity.
  - More sheet includes open public room + copy link actions.

## Shared Mobile Bottom Sheet

New component:

- `src/components/ui/MobileBottomSheet.tsx`

Features:

- Backdrop + close action
- Bottom anchored sheet
- Max content height with internal scroll (`max-h-[86vh]`)
- Safe-area bottom padding (`env(safe-area-inset-bottom)`)
- Prevents body/html scroll bleed while open
- Mobile-only rendering (`lg:hidden`)

## Functionality Preservation

Preserved existing behavior:

- Bid flow
- Buy now flow
- Queue behavior
- Chat behavior
- Seller room start/end and item status actions
- Existing data APIs and contracts

## Verification

Command checks:

- `npm run test` ✅
- `npm run test:integration` ✅
- `npm run build` ✅

Manual UX checklist (implementation verification targets):

- Buyer 390x844: bid/buy CTA remains reachable without opening desktop-like side panels.
- Buyer: chat and queue open/close via bottom sheets.
- Buyer: shipping/action overlay remains visible in stage.
- Seller 390x844: START/END/PASS available without scrolling into desktop columns.
- Seller: queue/chat/sales open via mobile bottom nav sheets.
- No horizontal overflow introduced in modified layouts.
- Bottom controls include safe-area spacing.

## Known Follow-ups

- Add drag-to-close sheet gesture and snap points (currently tap-based).
- Wire increment chips to host-side auction increment behavior if/when backend endpoint is added.
- Add viewport-level Playwright snapshots for 360x800, 375x667, 390x844, 430x932.
- Consider keyboard-aware repositioning for chat input on older mobile browsers with dynamic viewport quirks.
- On 375x667, host console header actions can become dense; if this appears in QA, move secondary actions into the `More` sheet at this viewport only.
- In long/fast chats, bottom-sheet chat performance may benefit from message virtualization if room throughput increases.

