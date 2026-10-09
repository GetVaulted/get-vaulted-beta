/**
 * Feature flag for PYT/PYD "Random Team" / "Random Division" break sale types.
 *
 * Was disabled for App Store compliance review because randomized-outcome purchases read as a
 * loot-box/gambling mechanic without age-gating and odds disclosure. Re-enabled now that the
 * purchase API requires an 18+ confirmation and enforces per-buyer limits
 * (`web/src/lib/random-purchase-guard.ts`) and buyers see the odds before paying.
 * All the underlying vault-reveal logic, purchase flow, and UI stay in place; this flag only
 * hides the "Random Teams" / "Random Divisions" options from the seller sale-type picker
 * (web `AddQueueItemModal` + mobile `AddInventoryModal`) so no new random breaks can be
 * created. Set to `false` to hide them again.
 */
export const RANDOM_BREAK_SALE_TYPES_ENABLED = true;

/**
 * Surprise Sets: a sealed pool of items sold at one price per unit, drawn at random on purchase.
 * Built on the Random Player pool, so it shares the 18+ confirmation and purchase limits above.
 */
export const SURPRISE_SET_SALE_TYPE_ENABLED = true;
