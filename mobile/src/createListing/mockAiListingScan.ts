import type { CreateListingFormState } from './types';

/**
 * Optional media assist — returns only high-confidence suggestions.
 * Pipeline is stubbed: no vision fill until recognition is reliable.
 * Reads existing draft fields so later models can use seller + media context.
 */
export function buildMockAiListingScan(form: CreateListingFormState): Partial<CreateListingFormState> {
  void form.media.length;
  void form.title;
  void form.category;
  return {};
}
