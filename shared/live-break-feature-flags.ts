/**
 * Feature flag for PYT/PYD "Random Team" / "Random Division" break sale types.
 *
 * Temporarily disabled (not removed) for App Store compliance review — randomized-outcome
 * purchases read as a loot-box/gambling mechanic without age-gating and odds disclosure.
 * All the underlying vault-reveal logic, purchase flow, and UI stay in place; this flag only
 * hides the "Random Teams" / "Random Divisions" options from the seller sale-type picker
 * (web `AddQueueItemModal` + mobile `AddInventoryModal`) so no new random breaks can be
 * created. Flip back to `true` once age-gating / odds disclosure ships to re-enable.
 */
export const RANDOM_BREAK_SALE_TYPES_ENABLED = false;
