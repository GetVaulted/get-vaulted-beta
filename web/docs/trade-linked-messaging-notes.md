# Trade-Linked Messaging

Trade chat is participant-scoped and supplemental to Trade Center offer terms.

## Rules

- Structured trade terms, statuses, and `TradeOfferEvent` timeline remain authoritative.
- Chat must never overwrite or replace offer items/cash/status.
- Only offer participants can open the thread (admins cannot open for others via this endpoint).
- Entry points: trade detail (`/trade/[id]`) and mobile Trade Detail / Review Offer — not a global random DM.

## Implementation

- `TradeOffer.conversationId` links to `MessageThread.id`.
- Anchor key: `trade:{offerId}` with `conversationKind = trade`, `inbox = primary`.
- Ensure API: `POST /api/trade/offers/[id]/conversation` → `{ threadId, href }`.
- Helper: `ensureTradeOfferThread` in `web/src/lib/message-threads.ts`.
