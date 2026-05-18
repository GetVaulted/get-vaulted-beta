import type { VaultThreadKind } from './vaultMessagingTypes';

/**
 * Architecture plan — private vault communication (not generic chat).
 *
 * Phase 1 (current): reuse `messages` tables for seller_inquiry; tag thread metadata.
 * Phase 2: dedicated `vault_threads` + `vault_messages` with kind + reference_id.
 * Phase 3: dispute/support lanes read-only for one party when locked.
 */

export const VAULT_MESSAGING_LANES: Record<
  VaultThreadKind,
  { title: string; description: string; allowedReferences: string[] }
> = {
  trade_negotiation: {
    title: 'Trade desk',
    description: 'Offer, counter, and acceptance — tied to a trade offer id.',
    allowedReferences: ['trade'],
  },
  support: {
    title: 'Vault support',
    description: 'Linked to support tickets; staff can join thread.',
    allowedReferences: ['support_ticket'],
  },
  order: {
    title: 'Order lane',
    description: 'Buyer–seller fulfillment and delivery questions.',
    allowedReferences: ['order', 'listing'],
  },
  seller_inquiry: {
    title: 'Collector message',
    description: 'Pre-purchase questions on listings or live rooms.',
    allowedReferences: ['listing', 'live_room'],
  },
  dispute: {
    title: 'Protected dispute',
    description: 'Serious issues only; moderated, immutable timeline.',
    allowedReferences: ['dispute', 'trade', 'order'],
  },
};

export const MESSAGING_MIGRATION_CHECKLIST = [
  'Add thread_kind + reference columns to existing message threads',
  'Route Trade Center compose → trade_negotiation',
  'Route Contact Support → support (no free-form DM)',
  'Block dispute threads from marketing copy',
  'Expose unified inbox filtered by kind',
] as const;
