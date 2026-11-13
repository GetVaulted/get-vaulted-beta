import { useEffect, useState } from 'react';
import { fetchHostPublisher, type HostPublisherKind } from '../api/agoraHostRepository';
import { isAgoraNativeAvailable } from '../lib/agoraEngine';
import { useMobileAgoraPublish } from './useMobileAgoraPublish';
import { useMobileStagePublish } from './useMobileStagePublish';

type PublishArgs = Parameters<typeof useMobileStagePublish>[0];

type Selection = { resolved: boolean; kind: HostPublisherKind; agoraAppId: string | null };

/**
 * Picks the seller's video sender for this room: AWS IVS Stage (default) or Agora (backup
 * provider, chosen by the admin switch). Both publishers expose the same controls, so the host
 * screen treats the result identically. Only the selected one is active; the other stays idle.
 *
 * Any lookup failure, or an app build without the Agora native module, selects AWS.
 */
export function useHostPublisher(args: PublishArgs) {
  const { roomId, accessToken } = args;
  const [selection, setSelection] = useState<Selection>({ resolved: false, kind: 'aws_ivs', agoraAppId: null });

  useEffect(() => {
    let cancelled = false;
    if (!roomId || !accessToken.trim()) {
      setSelection({ resolved: false, kind: 'aws_ivs', agoraAppId: null });
      return;
    }
    void (async () => {
      const result = await fetchHostPublisher(roomId, accessToken);
      if (cancelled) return;
      const useAgora = result.publisher === 'agora' && Boolean(result.agoraAppId) && isAgoraNativeAvailable();
      setSelection({
        resolved: true,
        kind: useAgora ? 'agora' : 'aws_ivs',
        agoraAppId: useAgora ? result.agoraAppId : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, accessToken]);

  const agoraActive = selection.resolved && selection.kind === 'agora';

  const aws = useMobileStagePublish({
    ...args,
    previewEnabled: args.previewEnabled && selection.resolved && !agoraActive,
  });
  const agora = useMobileAgoraPublish({
    ...args,
    previewEnabled: args.previewEnabled && agoraActive,
    agoraAppId: selection.agoraAppId,
  });

  return { ...(agoraActive ? agora : aws), publisherKind: (agoraActive ? 'agora' : 'aws_ivs') as HostPublisherKind };
}
