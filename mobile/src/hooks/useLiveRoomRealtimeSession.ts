import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  fetchLiveRoomBuyerSnapshot,
  type LiveRoomBuyerSnapshot,
  type LiveBidHttpAck,
} from '../api/liveRoomBuyerRepository';
import { mergeBuyerSnapshotForBidPlaced, mergeBuyerSnapshotForBidAck, mergeBuyerSnapshotForActiveItemChanged } from '../lib/liveRoomBuyerSnapshotMerge';
import {
  applyBuyerSnapshotPurchaseCompleted,
  recomputeBuyerSnapshotPhase,
} from '../lib/liveBuyerSnapshotClock';
import { computeAuctionRemainingMs, logAuctionTimer } from '../lib/auctionTimerSync';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import {
  parsePurchaseCompletedCelebration,
  type LiveAuctionCloseCelebration,
} from '../lib/liveAuctionWinnerDisplay';
import { createRealtimeEventGuard, shouldProcessRealtimeEvent } from '../lib/realtimeEventGuard';
import type { RoomBroadcastPayload } from '../lib/realtimeChannels';
import { estimateClockSkewMs, syncedWallTimeMs } from '../lib/serverClockSync';
import { isSupabaseConfigured } from '../lib/supabase';
import { useRealtimeRoomSubscription, type LiveRoomChatBroadcastMessage } from './useRealtimeRoomSubscription';

const FALLBACK_POLL_CONNECTED_MS = 30_000;
const FALLBACK_POLL_DISCONNECTED_MS = 5000;
const RECONCILE_DEBOUNCE_MS = 120;
const SKEW_REFRESH_MS = 45_000;

export type LiveRoomConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'polling';

export function useLiveRoomRealtimeSession(args: {
  roomId: string;
  accessToken?: string;
  userId?: string;
  enabled: boolean;
  hostUsername: string;
  onChatBroadcast?: (message: LiveRoomChatBroadcastMessage) => void;
  onStreamRefresh?: () => void;
}) {
  const [roomSnap, setRoomSnap] = useState<LiveRoomBuyerSnapshot | null>(null);
  const [syncRefreshing, setSyncRefreshing] = useState(false);
  const [clockSkewMs, setClockSkewMs] = useState(0);
  const [connectionState, setConnectionState] = useState<LiveRoomConnectionState>(
    isSupabaseConfigured() ? 'connecting' : 'polling',
  );
  const [connectionBanner, setConnectionBanner] = useState<string | null>(null);
  const [myHighBidUsd, setMyHighBidUsd] = useState<number | null>(null);
  const [showOutbidToast, setShowOutbidToast] = useState(false);
  const [soldCelebration, setSoldCelebration] = useState<LiveAuctionCloseCelebration | null>(null);

  const unresolvedPaymentFailure = roomSnap?.unresolvedPaymentFailure ?? null;

  const myHighBidUsdRef = useRef<number | null>(null);
  useEffect(() => {
    myHighBidUsdRef.current = myHighBidUsd;
  }, [myHighBidUsd]);

  const guardRef = useRef(createRealtimeEventGuard());
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outbidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeConnectedRef = useRef(false);
  const fetchStartRef = useRef(0);

  const refreshSkewFromServer = useCallback((serverNowMs: number | undefined, clientStartMs: number) => {
    if (typeof serverNowMs !== 'number' || !Number.isFinite(serverNowMs)) return;
    const skew = estimateClockSkewMs(clientStartMs, Date.now(), serverNowMs);
    setClockSkewMs(skew);
  }, []);

  const fetchSnapshot = useCallback(async (): Promise<LiveRoomBuyerSnapshot | null> => {
    fetchStartRef.current = Date.now();
    setSyncRefreshing(true);
    try {
      const snap = await fetchLiveRoomBuyerSnapshot(args.accessToken, args.roomId);
      refreshSkewFromServer(snap.serverNowMs, fetchStartRef.current);
      setRoomSnap(snap);
      return snap;
    } catch {
      return null;
    } finally {
      setSyncRefreshing(false);
    }
  }, [args.accessToken, args.roomId, refreshSkewFromServer]);

  const scheduleReconcile = useCallback(
    (delayMs = RECONCILE_DEBOUNCE_MS) => {
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
      reconcileTimerRef.current = setTimeout(() => {
        reconcileTimerRef.current = null;
        void fetchSnapshot();
      }, delayMs);
    },
    [fetchSnapshot],
  );

  const refreshSkewFromRealtime = useCallback(
    (serverNowMs: number | undefined, clientStartMs?: number) => {
      if (typeof serverNowMs !== 'number') return;
      const start = clientStartMs ?? Date.now();
      const end = Date.now();
      setClockSkewMs(estimateClockSkewMs(start, end, serverNowMs));
    },
    [],
  );

  const refreshSkewFromTimeEndpoint = useCallback(async () => {
    const base = getWebApiBaseUrl();
    if (!base) return;
    const t0 = Date.now();
    try {
      const res = await fetch(`${base}/api/time`, { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const j = (await res.json()) as { serverNowMs?: number };
      refreshSkewFromRealtime(j.serverNowMs, t0);
    } catch {
      /* ignore */
    }
  }, [refreshSkewFromRealtime]);

  const maybeShowOutbid = useCallback(
    (payload: RoomBroadcastPayload, snap: LiveRoomBuyerSnapshot | null) => {
      if (!args.userId || myHighBidUsd == null || !snap) return;
      const leader = payload.leadingBidderId ?? payload.bidderId;
      if (leader === args.userId) return;
      const high = payload.amountUsd ?? snap.currentBidUsd;
      if (high == null || high <= myHighBidUsd + 0.01) return;
      setShowOutbidToast(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      if (outbidTimerRef.current) clearTimeout(outbidTimerRef.current);
      outbidTimerRef.current = setTimeout(() => setShowOutbidToast(false), 3200);
    },
    [args.userId],
  );

  const onBidPlaced = useCallback(
    (payload: RoomBroadcastPayload) => {
      if (!shouldProcessRealtimeEvent(guardRef.current, 'bid_placed', payload)) return;
      refreshSkewFromRealtime(payload.serverNowMs);
      const wallNow = syncedWallTimeMs(
        typeof payload.serverNowMs === 'number'
          ? estimateClockSkewMs(Date.now(), Date.now(), payload.serverNowMs)
          : clockSkewMs,
      );
      setRoomSnap((prev) => {
        if (!prev) return prev;
        const merged = mergeBuyerSnapshotForBidPlaced(prev, payload, wallNow);
        if (merged) {
          logAuctionTimer({
            source: 'bid_placed',
            serverNowMs: payload.serverNowMs,
            localNowMs: Date.now(),
            offsetMs: clockSkewMs,
            auctionEndsAt: merged.auctionEndsAt,
            remainingMs: computeAuctionRemainingMs(merged.auctionEndsAt, clockSkewMs),
            auctionSeq: payload.auctionSeq,
            lotBidPhase: merged.lotBidPhase,
          });
          maybeShowOutbid(payload, merged);
        }
        return merged ?? prev;
      });
      scheduleReconcile(80);
    },
    [clockSkewMs, maybeShowOutbid, refreshSkewFromRealtime, scheduleReconcile],
  );

  const onActiveItemChanged = useCallback(
    (payload: RoomBroadcastPayload) => {
      if (!shouldProcessRealtimeEvent(guardRef.current, 'active_item_changed', payload)) return;
      refreshSkewFromRealtime(payload.serverNowMs);
      const wallNow = syncedWallTimeMs(clockSkewMs);
      setMyHighBidUsd(null);
      setRoomSnap((prev) => {
        if (!prev) return prev;
        const merged = mergeBuyerSnapshotForActiveItemChanged(prev, payload, wallNow);
        if (merged) {
          logAuctionTimer({
            source: 'active_item_changed',
            serverNowMs: payload.serverNowMs,
            localNowMs: Date.now(),
            offsetMs: clockSkewMs,
            auctionEndsAt: merged.auctionEndsAt,
            remainingMs: computeAuctionRemainingMs(merged.auctionEndsAt, clockSkewMs),
            lotBidPhase: merged.lotBidPhase,
          });
        }
        return merged ?? prev;
      });
      scheduleReconcile(40);
    },
    [clockSkewMs, refreshSkewFromRealtime, scheduleReconcile],
  );

  useRealtimeRoomSubscription({
    liveRoomId: args.enabled ? args.roomId : null,
    enabled: args.enabled && isSupabaseConfigured(),
    onLiveRoomMessage: (message) => {
      args.onChatBroadcast?.(message);
    },
    onMessagesRefreshMerge: () => args.onChatBroadcast?.({ id: '', body: '', messageType: '__refresh__' }),
    onQueueItemsChange: () => scheduleReconcile(350),
    onBreakSpotsChange: () => scheduleReconcile(450),
    onListingBid: () => scheduleReconcile(450),
    onTeamBoardChange: () => scheduleReconcile(450),
    onBidPlaced,
    onActiveItemChanged,
    onAuctionStarted: (payload) => {
      if (!shouldProcessRealtimeEvent(guardRef.current, 'auction_started', payload)) return;
      refreshSkewFromRealtime(payload.serverNowMs);
      scheduleReconcile(80);
    },
    onAuctionEnded: (payload) => {
      if (!shouldProcessRealtimeEvent(guardRef.current, 'auction_ended', payload)) return;
      scheduleReconcile(1000);
    },
    onPurchaseCompleted: (payload) => {
      if (!shouldProcessRealtimeEvent(guardRef.current, 'purchase_completed', payload)) return;
      refreshSkewFromRealtime(payload.serverNowMs);
      if (payload.paymentStatus === 'payment_failed' && payload.winnerId && args.userId && payload.winnerId === args.userId) {
        void fetchSnapshot();
      }
      const wallNow = syncedWallTimeMs(clockSkewMs);
      setRoomSnap((prev) => {
        if (!prev) return prev;
        return applyBuyerSnapshotPurchaseCompleted(prev, payload.itemId, wallNow);
      });
      const celebration = parsePurchaseCompletedCelebration(payload);
      if (celebration) setSoldCelebration(celebration);
      logAuctionTimer({
        source: 'purchase_completed',
        serverNowMs: payload.serverNowMs,
        localNowMs: Date.now(),
        offsetMs: clockSkewMs,
        auctionEndsAt: null,
        remainingMs: 0,
        lotBidPhase: 'settled',
      });
      scheduleReconcile(900);
    },
    onPaymentFailed: (payload) => {
      if (payload.buyerId && args.userId && payload.buyerId === args.userId) {
        void fetchSnapshot();
      }
    },
    onPaymentRecovered: (payload) => {
      if (payload.buyerId && args.userId && payload.buyerId === args.userId) {
        void fetchSnapshot();
      }
    },
    onStreamStatusChange: () => args.onStreamRefresh?.(),
    onRoomStateEvent: () => scheduleReconcile(600),
    onReconnect: () => {
      setConnectionBanner('Live connection restored');
      setTimeout(() => setConnectionBanner(null), 2400);
      scheduleReconcile(120);
    },
    onConnectionStateChange: ({ status, reconnectCount }) => {
      if (status === 'SUBSCRIBED') {
        realtimeConnectedRef.current = true;
        setConnectionState('connected');
        if (reconnectCount > 1) setConnectionBanner('Live connection restored');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        realtimeConnectedRef.current = false;
        setConnectionState('reconnecting');
        setConnectionBanner('Reconnecting…');
      } else if (status === 'JOINING') {
        setConnectionState(reconnectCount > 0 ? 'reconnecting' : 'connecting');
      }
    },
  });

  useEffect(() => {
    if (!args.enabled) return undefined;
    guardRef.current = createRealtimeEventGuard();
    void fetchSnapshot();
    void refreshSkewFromTimeEndpoint();
    const pollMs = isSupabaseConfigured() ? FALLBACK_POLL_CONNECTED_MS : FALLBACK_POLL_DISCONNECTED_MS;
    const id = setInterval(() => {
      const disconnected = !realtimeConnectedRef.current || !isSupabaseConfigured();
      if (disconnected) {
        setConnectionState('polling');
        void fetchSnapshot();
      } else {
        void fetchSnapshot();
      }
    }, pollMs);
    const skewId = setInterval(() => {
      void refreshSkewFromTimeEndpoint();
    }, SKEW_REFRESH_MS);
    return () => {
      clearInterval(id);
      clearInterval(skewId);
    };
  }, [args.enabled, fetchSnapshot, refreshSkewFromTimeEndpoint]);

  useEffect(() => {
    if (!args.enabled) return undefined;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        scheduleReconcile(60);
        void fetchSnapshot();
      }
    });
    return () => sub.remove();
  }, [args.enabled, fetchSnapshot, scheduleReconcile]);

  useEffect(
    () => () => {
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
      if (outbidTimerRef.current) clearTimeout(outbidTimerRef.current);
    },
    [],
  );

  return {
    roomSnap,
    syncRefreshing,
    clockSkewMs,
    connectionState,
    connectionBanner,
    myHighBidUsd,
    setMyHighBidUsd,
    showOutbidToast,
    soldCelebration,
    clearSoldCelebration: () => setSoldCelebration(null),
    unresolvedPaymentFailure,
    fetchSnapshot,
    syncedNowMs: () => syncedWallTimeMs(clockSkewMs),
    mergeBidAck: (ack: LiveBidHttpAck) => {
      refreshSkewFromRealtime(ack.serverNowMs);
      const wallNow = syncedWallTimeMs(
        typeof ack.serverNowMs === 'number'
          ? estimateClockSkewMs(Date.now(), Date.now(), ack.serverNowMs)
          : clockSkewMs,
      );
      setRoomSnap((prev) => {
        if (!prev) return prev;
        const merged = mergeBuyerSnapshotForBidAck(prev, ack, wallNow);
        if (merged) {
          logAuctionTimer({
            source: 'bid_http_ack',
            serverNowMs: ack.serverNowMs,
            localNowMs: Date.now(),
            offsetMs: clockSkewMs,
            auctionEndsAt: merged.auctionEndsAt,
            remainingMs: computeAuctionRemainingMs(merged.auctionEndsAt, clockSkewMs),
            auctionSeq: ack.auctionSeq,
            lotBidPhase: merged.lotBidPhase,
          });
        }
        return merged ?? prev;
      });
    },
  };
}
