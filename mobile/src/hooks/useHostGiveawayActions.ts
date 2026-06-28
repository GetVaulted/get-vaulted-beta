import { useCallback, useState } from 'react';
import {
  deleteLiveGiveaway,
  patchLiveGiveaway,
  type LiveGiveawayRow,
} from '../api/liveGiveawayRepository';
import { parseVaultRevealSpinPayload, type VaultRevealSpinPayload } from '../lib/vaultRevealSpin';

export type HostGiveawayAction = 'open_entries' | 'close_entries' | 'cancel' | 'draw' | 'delete';

export function useHostGiveawayActions(args: {
  accessToken: string;
  roomId: string;
  onRefresh: () => Promise<void>;
  onToast?: (message: string) => void;
  onDrawSpin?: (spin: VaultRevealSpinPayload) => void;
  onDrawComplete?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const runAction = useCallback(
    async (id: string, action: HostGiveawayAction): Promise<LiveGiveawayRow | null> => {
      setBusy(true);
      try {
        if (action === 'delete') {
          await deleteLiveGiveaway(args.accessToken, args.roomId, id);
          await args.onRefresh();
          args.onToast?.('Giveaway deleted.');
          return null;
        }

        const result = await patchLiveGiveaway(args.accessToken, args.roomId, id, action);
        await args.onRefresh();

        if (action === 'draw') {
          const spin = result.spin ? parseVaultRevealSpinPayload({ spin: result.spin }) : null;
          if (spin) {
            args.onDrawSpin?.(spin);
          }
          args.onDrawComplete?.();
          if (result.giveaway.winnerUsername?.trim()) {
            args.onToast?.(`Winner @${result.giveaway.winnerUsername.trim()}`);
          } else if (spin) {
            args.onToast?.('Giveaway drawn.');
          }
        } else if (action === 'open_entries') {
          args.onToast?.('Entries open.');
        } else if (action === 'close_entries') {
          args.onToast?.('Entries closed.');
        } else if (action === 'cancel') {
          args.onToast?.('Giveaway cancelled.');
        }

        return result.giveaway;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Giveaway action failed.';
        args.onToast?.(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [args.accessToken, args.onDrawComplete, args.onDrawSpin, args.onRefresh, args.onToast, args.roomId],
  );

  return { busy, runAction };
}

export function pickHostStageGiveaway(giveaways: LiveGiveawayRow[]): LiveGiveawayRow | null {
  const openLane = giveaways.filter((g) => g.kind === 'open');
  return (
    openLane.find((g) => g.status === 'entries_open') ??
    openLane.find((g) => g.status === 'entries_closed') ??
    openLane.find((g) => g.status === 'draft') ??
    null
  );
}
