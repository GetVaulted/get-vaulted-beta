import { useCreateListingDraft } from '../../createListing/CreateListingDraftContext';
import {
  LISTING_CHANNEL_CONFIG,
  LISTING_FLOW_STEP,
  stepCountForChannel,
  type ListingChannel,
} from '../../createListing/listingChannel';

export function useCreateListingFlow() {
  const { form } = useCreateListingDraft();
  const channel: ListingChannel = form.listingChannel ?? 'marketplace';
  const accent = LISTING_CHANNEL_CONFIG[channel];
  const totalSteps = stepCountForChannel(channel);
  const isLiveShow = channel === 'live_show';
  const step = LISTING_FLOW_STEP[channel];
  return { channel, accent, totalSteps, isLiveShow, step };
}
