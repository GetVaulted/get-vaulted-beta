# Vaulted Live Phase 1 Smoke Test (Two Session)

Use two browser sessions:
- Session A: Seller (host)
- Session B: Buyer

Optional debug flag:
- Set `NEXT_PUBLIC_LIVE_DEBUG=true`
- Open DevTools Console in both sessions

## Preconditions

1. Seller has a live room with at least one queued item.
2. Buyer account is valid and can place bids.
3. Both sessions can open the same room URL: `/live/<roomId>`.

## Checklist

1. **Buyer joins room**
   - Open room in Session B.
   - Expected: room loads, chat visible, viewer count renders.

2. **Seller joins same room**
   - Open host console and public room in Session A.
   - Expected: both sessions connected to same room id.

3. **Chat instant sync**
   - Buyer sends chat message.
   - Expected: message appears instantly in seller chat.
   - Seller sends system message.
   - Expected: message appears instantly for buyer.

4. **Viewer count increment/decrement**
   - Open an extra tab as buyer, then close it.
   - Expected: presence count increases/decreases quickly (no hard refresh required).

5. **Seller starts auction**
   - Seller starts room/auction item.
   - Expected: buyer sees auction state transition quickly.

6. **Buyer sees active item instantly**
   - Seller switches active item.
   - Expected: buyer active item changes without manual refresh.

7. **Buyer places bid**
   - Buyer taps bid.
   - Expected: bid accepted, button disables while submitting, optimistic bid updates.

8. **Seller sees bid instantly**
   - Expected: seller UI/chat reflects bid quickly.

9. **Seller ends auction**
   - Seller ends room/auction.
   - Expected: buyer sees ended state quickly.

10. **Purchase completion event**
   - Complete checkout for buy-now or auction winner.
   - Expected: `purchase_completed` path updates room state and sold status in both sessions.

## Debug Console Signals (with `NEXT_PUBLIC_LIVE_DEBUG=true`)

Look for `[LIVE_DEBUG]` events with:
- `event`: `event_received` or `fallback_room_refresh`
- `type`: `chat_message`, `bid_placed`, `active_item_changed`, `auction_started`, `auction_ended`, `purchase_completed`
- `roomId`
- `timestamp`
- `msSinceLastRoomRefresh`

## Pass Criteria

- No manual refresh needed for core flow transitions.
- Realtime updates arrive before fallback refresh in normal network conditions.
- Fallback refresh still recovers state when an event payload is incomplete.
