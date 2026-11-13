import { createContext, useContext } from 'react';
import type { HostPublisherKind } from '../api/agoraHostRepository';

/** Which sender the host screen is using, so deep children (camera preview) render the matching view. */
export const HostPublisherKindContext = createContext<HostPublisherKind>('aws_ivs');

export function useHostPublisherKind(): HostPublisherKind {
  return useContext(HostPublisherKindContext);
}
