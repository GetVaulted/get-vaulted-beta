import type { MessageConversationKind } from '../types/messages';
import type { VaultThreadKind } from './vaultMessagingTypes';

export function vaultKindFromConversation(kind: MessageConversationKind): VaultThreadKind {
  switch (kind) {
    case 'trade':
    case 'offer_negotiation':
      return 'trade_negotiation';
    case 'order_support':
      return 'order';
    case 'system':
      return 'support';
    default:
      return 'seller_inquiry';
  }
}

export function vaultKindLabel(kind: VaultThreadKind): string {
  switch (kind) {
    case 'trade_negotiation':
      return 'Trade desk';
    case 'support':
      return 'Vault support';
    case 'order':
      return 'Order lane';
    case 'seller_inquiry':
      return 'Collector inquiry';
    case 'dispute':
      return 'Protected dispute';
  }
}

export const VAULT_THREAD_FILTERS: { id: VaultThreadKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All lanes' },
  { id: 'trade_negotiation', label: 'Trades' },
  { id: 'order', label: 'Orders' },
  { id: 'seller_inquiry', label: 'Inquiries' },
  { id: 'support', label: 'Support' },
  { id: 'dispute', label: 'Disputes' },
];
