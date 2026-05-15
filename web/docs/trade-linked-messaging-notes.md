# Trade-Linked Messaging Notes (Future Scope)

These notes define the intended direction for trade-linked messaging after Trade MVP.

## Scope guardrails

- Messaging is not part of Trade MVP and no trade chat UI is shipped in v1.
- Structured trade terms, statuses, and `TradeOfferEvent` timeline remain authoritative.
- Chat is supplemental only and must never overwrite or replace offer terms.

## Participant and entry constraints

- Messaging must be limited to active participants of the trade offer (plus admin moderation tools as needed).
- Entry to messaging should come from the trade detail page (`/trade/[id]`), not from a global random DM entry point.
- Trade-linked messages should remain tied to a specific trade offer context.

## Conversation linkage

- `TradeOffer.conversationId` is a nullable future hook.
- It should remain safely unused in MVP behavior until participant-scoped messaging is intentionally implemented.
- Any future linkage should preserve existing authorization boundaries used by trade detail APIs.
