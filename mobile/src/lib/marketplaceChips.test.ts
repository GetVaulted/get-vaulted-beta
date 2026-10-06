import { describe, expect, it } from 'vitest';
import { MARKETPLACE_CHIPS, marketplaceChipCategory, marketplaceChipQuery } from './marketplaceChips';

describe('marketplaceChips', () => {
  it('starts with an unfiltered All chip', () => {
    expect(MARKETPLACE_CHIPS[0]).toMatchObject({ id: 'all', label: 'All' });
    expect(marketplaceChipCategory('all')).toBeUndefined();
  });

  it('maps each chip to the server category label', () => {
    expect(marketplaceChipCategory('helmets')).toBeUndefined();
    expect(marketplaceChipCategory('cards')).toBe('Trading Cards');
    expect(marketplaceChipCategory('memorabilia')).toBe('Memorabilia');
  });

  it('finds helmets by title, since they are listed under Memorabilia', () => {
    expect(marketplaceChipQuery('helmets')).toBe('helmet');
    expect(marketplaceChipQuery('all')).toBeUndefined();
    expect(marketplaceChipQuery('memorabilia')).toBeUndefined();
  });

  it('has unique chip ids', () => {
    const ids = MARKETPLACE_CHIPS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
