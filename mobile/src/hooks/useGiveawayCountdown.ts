import { useEffect, useRef, useState } from 'react';
import { formatGiveawayCountdown, giveawaySecondsRemaining } from '../lib/giveawayCountdown';

/** Tick every second; fire `onExpired` once when the countdown reaches zero. */
export function useGiveawayCountdown(
  entryCloseAt: string | null | undefined,
  onExpired?: () => void,
) {
  const [tick, setTick] = useState(0);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!entryCloseAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [entryCloseAt]);

  void tick;
  const seconds = giveawaySecondsRemaining(entryCloseAt);
  const label = seconds != null ? formatGiveawayCountdown(seconds) : null;

  useEffect(() => {
    if (seconds == null) {
      expiredRef.current = false;
      return;
    }
    if (seconds > 0) {
      expiredRef.current = false;
      return;
    }
    if (!expiredRef.current) {
      expiredRef.current = true;
      onExpired?.();
    }
  }, [seconds, onExpired]);

  return { seconds, label };
}
