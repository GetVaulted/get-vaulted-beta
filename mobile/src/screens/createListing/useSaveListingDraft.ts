import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useCreateListingDraft } from '../../createListing/CreateListingDraftContext';

export function useSaveListingDraft() {
  const { saveDraft } = useCreateListingDraft();

  return useCallback(() => {
    saveDraft();
    Alert.alert('Draft saved', 'Resume anytime from Seller Studio → Inventory.');
  }, [saveDraft]);
}
