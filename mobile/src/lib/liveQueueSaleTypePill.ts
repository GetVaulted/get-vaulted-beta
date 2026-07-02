import type { LiveRoomItemRow } from '../api/liveRoomControlRepository';
import { isVariantSalesFormat } from './liveItemVariant';

export type QueueSaleTypePillLabel = 'Auction' | 'Buy Now';

/** Seller queue pill — reflects Auction vs Buy Now when the lot was added. */
export function queueSaleTypePillLabel(
  item: Pick<LiveRoomItemRow, 'salesFormat' | 'activeSpotCommerceMode'>,
): QueueSaleTypePillLabel {
  if (item.salesFormat === 'buy_now') return 'Buy Now';
  if (item.salesFormat === 'auction') return 'Auction';
  if (isVariantSalesFormat(item.salesFormat)) {
    return item.activeSpotCommerceMode === 'auction' ? 'Auction' : 'Buy Now';
  }
  return 'Auction';
}
