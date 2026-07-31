import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LiveItemVariantSnapshot } from '../../api/liveRoomBuyerRepository';
import {
  isActiveVariantBuyerItem,
  variantIsAvailable,
  variantSelectSpotLabel,
} from '../../lib/liveItemVariant';

const liveDir = __dirname;

function readComponent(name: string): string {
  return readFileSync(resolve(liveDir, name), 'utf8');
}

describe('buyer break checkout routing', () => {
  it('opens compact checkout sheet from the live commerce bar for PYT', () => {
    const snap = {
      status: 'live' as const,
      activeItemId: 'item-1',
      activeItemSalesFormat: 'variant_selection' as const,
      activeItemVariants: [
        { id: 'v1', label: 'Ravens', quantityRemaining: 1, status: 'available', priceUsd: 49, sortOrder: 0 },
      ],
    };
    expect(isActiveVariantBuyerItem(snap as import('../../api/liveRoomBuyerRepository').LiveRoomBuyerSnapshot)).toBe(true);
    expect(variantSelectSpotLabel('variant_selection')).toBe('Pick Your Team');

    const bar = readComponent('LivePinnedActionBar.tsx');
    expect(bar).toContain('LiveBreakSpotGridSheet');
    expect(bar).toContain('setVariantSheetOpen(true)');
    // Checkout stays on the compact sheet; sold roster reuses the host team board.
    expect(bar).toContain('SellerBreakSpotBoardSheet');
    expect(bar).toContain('setTeamsRosterOpen(true)');
  });

  it('opens compact checkout sheet from the live commerce bar for PYD', () => {
    const snap = {
      status: 'live' as const,
      activeItemId: 'item-2',
      activeItemSalesFormat: 'team_break' as const,
      activeItemVariants: [
        { id: 'v2', label: 'AFC North', quantityRemaining: 1, status: 'available', priceUsd: 99, sortOrder: 0 },
      ],
    };
    expect(isActiveVariantBuyerItem(snap as import('../../api/liveRoomBuyerRepository').LiveRoomBuyerSnapshot)).toBe(true);
    expect(variantSelectSpotLabel('team_break')).toBe('Pick Your Division');
  });

  it('keeps host mark-sold controls off the buyer sold roster', () => {
    const host = readFileSync(resolve(liveDir, '../seller/liveOverlay/SellerLiveHostView.tsx'), 'utf8');
    expect(host).toContain('SellerBreakSpotBoardSheet');
    const bar = readComponent('LivePinnedActionBar.tsx');
    expect(bar).toContain('SellerBreakSpotBoardSheet');
    expect(bar).not.toContain('canMarkSold');
    expect(bar).not.toContain('onMarkSold');
  });

  it('aliases LiveVariantSelectionSheet to the compact checkout sheet', () => {
    const alias = readComponent('LiveVariantSelectionSheet.tsx');
    expect(alias).toContain('LiveBreakSpotGridSheet');
    expect(alias).not.toContain('spotCellTeam');
    expect(alias).not.toContain('gridContentTeams');
  });
});

describe('LiveBreakSpotGridSheet QA safeguards', () => {
  const sheet = readComponent('LiveBreakSpotGridSheet.tsx');

  it('uses bottom checkout sheet layout, not a center board', () => {
    expect(sheet).toContain("justifyContent: 'flex-end'");
    expect(sheet).toContain("maxHeight: '72%'");
    expect(sheet).not.toContain('spotCellTeam');
    expect(sheet).not.toContain('spotGradient');
    expect(sheet).not.toContain("maxHeight: '90%'");
  });

  it('keeps payment controls sticky and picker scrollable', () => {
    expect(sheet).toContain('stickyBar');
    expect(sheet).toContain('flexShrink: 0');
    expect(sheet).toContain('bodyScroll');
    expect(sheet).toContain('HoldToBidButton');
  });

  it('blocks sold spots and updates picker title with selection', () => {
    expect(sheet).toContain('disabled={soldOut}');
    expect(sheet).toContain('if (rosterMode || !variantIsAvailable(variant)) return');
    expect(sheet).toContain('${pickerBaseLabel}: ${selectedVariants[0]!.label}');
  });

  it('marks sold-out variants unavailable for tap', () => {
    const sold: LiveItemVariantSnapshot = {
      id: 'sold-1',
      label: 'Sold Team',
      quantityRemaining: 0,
      status: 'sold_out',
      priceUsd: 25,
      sortOrder: 0,
      soldCount: 1,
      isHot: false,
      buyerUsername: null,
    };
    expect(variantIsAvailable(sold)).toBe(false);
  });
});
