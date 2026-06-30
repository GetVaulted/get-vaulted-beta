import { LISTING_PRICING_ASSISTANT_ENABLED } from './listingAiAssistantEnabled';
import type { CreateListingFormState } from './types';

export type AssistantTurn = {
  reply: string;
  patch?: Partial<CreateListingFormState>;
};

const premiumDesc =
  'A museum-grade presentation for serious collectors — provenance-forward, condition-transparent, and tuned for live hammer energy.';

export function listingAssistantReply(prompt: string, form: CreateListingFormState): AssistantTurn {
  const p = prompt.toLowerCase();

  if (p.includes('better description') || p.includes('rewrite description')) {
    return {
      reply: `Here’s a tighter pass while keeping your facts:\n\n${form.description ? `${form.description}\n\n—` : ''} ${premiumDesc}`,
      patch: form.description.trim()
        ? undefined
        : {
            description: premiumDesc,
          },
    };
  }
  if (p.includes('premium') || p.includes('luxury')) {
    return {
      reply: 'Dialing up tone: lead with lineage, finite supply, and vault-ready fulfillment. Avoid hype slang — let scarcity and condition do the work.',
      patch: { description: form.description.trim() ? `${form.description.trim()}\n\n${premiumDesc}` : premiumDesc },
    };
  }
  if (p.includes('price') || p.includes('pricing')) {
    if (!LISTING_PRICING_ASSISTANT_ENABLED) {
      return {
        reply:
          'Pricing suggestions are paused while we build more marketplace data. Set your ask on the Pricing step — you control the final number buyers see.',
      };
    }
    const sug = form.aiSuggestedPrice || '—';
    return {
      reply: `Vault assistant suggests ${sug} based on your lane (illustrative — not market advice). You set the final number buyers see. Reasoning on file: ${form.aiPriceReasoning || 'Add pricing on the Pricing step — media suggestions are optional when available.'}`,
    };
  }
  if (p.includes('seo') || p.includes('tags')) {
    const nextTags = form.tags.trim()
      ? `${form.tags}, vaulted, grail, authenticated imagery`
      : 'vaulted, collectible, authenticated imagery, live-ready';
    return {
      reply: 'Added discovery-oriented tags. You can prune anything that does not match your item.',
      patch: { tags: nextTags },
    };
  }
  if (p.includes('shipping') || p.includes('weight')) {
    const tier = form.aiShippingWeightCategory || 'Choose a shipping method on the Shipping step — AI tier hints are optional.';
    return {
      reply: `Shipping weight lane: ${tier}. Confirm on the Shipping step before publish — carriers bill on your final packaging.`,
    };
  }
  if (p.includes('live auction') || p.includes('auction copy')) {
    return {
      reply:
        'Live lane hook: open with the story beat, flash condition + grade visibility, reserve discipline, and a clean call-to-action for chat bids.',
    };
  }
  if (p.includes('trade')) {
    return {
      reply:
        'Trade-friendly framing: list what you will consider, highlight swap safety (escrow), and avoid implying guaranteed value on either side.',
      patch: form.tradeInterests.trim()
        ? undefined
        : { tradeInterests: 'Open to graded rookies, modern slabs, or cash + trade. Serious offers only — escrow recommended.' },
    };
  }

  const pricingHint = LISTING_PRICING_ASSISTANT_ENABLED ? '“Suggest price”, ' : '';

  return {
    reply:
      `Try: “Write a better description”, “Make this sound more premium”, ${pricingHint}“Add SEO tags”, “Estimate shipping weight”, “Create live auction copy”, or “Make this trade-friendly”.`,
  };
}
