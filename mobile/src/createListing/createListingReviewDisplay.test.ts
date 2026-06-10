import { describe, expect, it } from 'vitest';
import {
  asListingString,
  getCreateListingReviewIssues,
  isLayawayPriceEligible,
  parseListingPriceUsd,
  resolveSellerDisplayPrice,
} from './createListingReviewDisplay';
import { emptyCreateListingForm } from './types';

describe('createListingReviewDisplay', () => {
  it('asListingString handles undefined without throwing', () => {
    expect(asListingString(undefined)).toBe('');
    expect(asListingString(null)).toBe('');
    expect(asListingString(' hello ')).toBe(' hello ');
  });

  it('parseListingPriceUsd strips currency symbols', () => {
    expect(parseListingPriceUsd('$1,250.50')).toBe(1250.5);
    expect(parseListingPriceUsd(undefined)).toBe(0);
  });

  it('resolveSellerDisplayPrice never calls replace on undefined price field', () => {
    const partial = { ...emptyCreateListingForm(), buyNowPrice: undefined as unknown as string };
    expect(resolveSellerDisplayPrice(partial)).toBe('—');
  });

  it('isLayawayPriceEligible uses buyNowPrice not legacy price field', () => {
    const eligible = { ...emptyCreateListingForm(), listingType: 'buy_now' as const, buyNowPrice: '$600' };
    const ineligible = { ...emptyCreateListingForm(), listingType: 'buy_now' as const, buyNowPrice: '$100' };
    expect(isLayawayPriceEligible(eligible)).toBe(true);
    expect(isLayawayPriceEligible(ineligible)).toBe(false);
    expect(isLayawayPriceEligible({ listingType: 'auction' })).toBe(false);
  });

  it('getCreateListingReviewIssues flags missing required fields for partial draft', () => {
    const issues = getCreateListingReviewIssues(
      { ...emptyCreateListingForm(), title: '', listingType: null, category: null },
      { photoCount: 0, isLiveShow: false },
    );
    expect(issues.some((i) => i.screen === 'CreateListingType')).toBe(true);
    expect(issues.some((i) => i.screen === 'CreateListingCategory')).toBe(true);
    expect(issues.some((i) => i.screen === 'CreateListingDetails')).toBe(true);
    expect(issues.some((i) => i.screen === 'CreateListingMedia')).toBe(true);
  });

  it('partial pricing draft surfaces pricing step issue', () => {
    const form = {
      ...emptyCreateListingForm(),
      listingType: 'buy_now' as const,
      category: 'cards' as const,
      title: 'Test card',
      buyNowPrice: '',
    };
    const issues = getCreateListingReviewIssues(form, { photoCount: 3, isLiveShow: false });
    expect(issues.find((i) => i.screen === 'CreateListingPricing')?.message).toMatch(/buy-now price/i);
  });
});
