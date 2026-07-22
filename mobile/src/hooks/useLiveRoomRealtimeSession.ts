import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  fetchLiveRoomBuyerSnapshot,
  type LiveRoomBuyerSnapshot,
  type LiveBidHttpAck,
} from '../api/liveRoomBuyerRepository';
import {
  mergeBuyerSnapshotForBidPlaced,
  mergeBuyerSnapshotForBidAck,
  mergeBuyerSnapshotForOptimisticBid,
  mergeBuyerSnapshotForActiveItemChanged,
  reconcileBuyerSnapshotMonotonic,
} from '../lib/liveRoomBuyerSnapshotMerge';
import { logBuyerRoomStateSnapshot } from '../lib/logRoomStateSnapshot';
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
import {
  parseAuctionWinSpotCelebration,
  parseVariantPurchasedCelebration,
  spotCelebrationDismissKey,
  SPOT_CELEBRATION_DISPLAY_MS,
  type LiveSpotTakenCelebration,
} from '../lib/liveSpotCelebration';
import { createRealtimeEventGuard, shouldProcessRealtimeEvent, syncAuctionSeqGuard } from '../lib/realtimeEventGuard';
import type { RoomBroadcastPayload } from '../lib/realtimeChannels';
import { estimateClockSkewMs, syncedWallTimeMs } from '../lib/serverClockSync';
import { isSupabaseConfigured } from '../lib/supabase';
import { parseVaultRevealSpinPayload, VAULT_REVEAL_TOTAL_DISPLAY_MS, vaultRevealDisplayMs, type VaultRevealSpinPayload } from '../lib/vaultRevealSpin';
import { viewerLifecycleLog } from '../lib/viewerLifecycleLog';
import { useRealtimeRoomSubscription, type LiveRoomChatBroadcastMessage } from './useRealtimeRoomSubscription';
import { useRealtimeRoomPresence } from './useRealtimeRoomPresence';

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
  viewerDisplayName?: string | null;
  /** Host/mod only — subscribe to staff chat broadcasts. */
  includeStaffChat?: boolean;
  /** Hard playback reset (WebRTC rejoin). Use only for go-live / ended transitions. */
  onStreamHardRefresh?: () => void;
  /** @deprecated Prefer onStreamHardRefresh — kept for callers that only need metadata. */
  onStreamRefresh?: () => void;
  /** Immediate streamPaused from `stream_status` — apply before GET /stream catches up. */
  onStreamPausedHint?: (streamPaused: boolean) => void;
  onModerationChanged?: () => void;
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
  const [spotCelebration, setSpotCelebration] = useState<LiveSpotTakenCelebration | null>(null);
  const [vaultRevealSpin, setVaultRevealSpin] = useState<VaultRevealSpinPayload | null>(null);
  const seenVaultRevealSpinIdsRef = useRef<Set<string>>(new Set());
  const seenSpotCelebrationKeysRef = useRef<Set<string>>(new Set());
  const pendingSpotCelebrationRef = useRef<LiveSpotTakenCelebration | null>(null);
  const pendingSpotCelebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vaultRevealActiveRef = useRef(false);
  const vaultRevealSpinRef = useRef<VaultRevealSpinPayload | null>(null);

  useEffect(() => {
    vaultRevealSpinRef.current = vaultRevealSpin;
  }, [vaultRevealSpin]);

  const viewerCount = useRealtimeRoomPresence({
    liveRoomId: args.roomId,
    enabled: args.enabled,
    userId: args.userId ?? null,
    viewerDisplayName: args.viewerDisplayName ?? null,
    trackSelf: true,
  });

  const showSpotCelebration = useCallback((taken: LiveSpotTakenCelebration) => {
    const key = spotCelebrationDismissKey(taken);
    if (seenSpotCelebrationKeysRef.current.has(key)) return;
    seenSpotCelebrationKeysRef.current.add(key);
    setSpotCelebration(taken);
    setTimeout(() => {
      seenSpotCelebrationKeysRef.current.delete(key);
    }, SPOT_CELEBRATION_DISPLAY_MS + 1000);
  }, []);

  const clearPendingSpotCelebrationTimer = useCallback(() => {
    if (pendingSpotCelebrationTimerRef.current) {
      clearTimeout(pendingSpotCelebrationTimerRef.current);
      pendingSpotCelebrationTimerRef.current = null;
    }
  }, []);

  const flushPendingSpotCelebration = useCallback(() => {
    clearPendingSpotCelebrationTimer();
    const pending = pendingSpotCelebrationRef.current;
    if (!pending) return;
    pendingSpotCelebrationRef.current = null;
    showSpotCelebration(pending);
  }, [clearPendingSpotCelebrationTimer, showSpotCelebration]);

  const queueSpotCelebrationAfterReveal = useCallback(
    (taken: LiveSpotTakenCelebration) => {
      pendingSpotCelebrationRef.current = taken;
      clearPendingSpotCelebrationTimer();
      const spin = vaultRevealSpinRef.current;
      const delayMs = (spin ? vaultRevealDisplayMs(spin) : VAULT_REVEAL_TOTAL_DISPLAY_MS) + 600;
      pendingSpotCelebrationTimerRef.current = setTimeout(() => {
        pendingSpotCelebrationTimerRef.current = null;
        flushPendingSpotCelebration();
      }, delayMs);
    },
    [clearPendingSpotCelebrationTimer, flushPendingSpotCelebration],
  );

  const clearSpotCelebration = useCallback(() => setSpotCelebration(null), []);
  const clearSoldCelebration = useCallback(() => setSoldCelebration(null), []);
  const clearVaultRevealSpin = useCallback(() => {
    vaultRevealActiveRef.current = false;
    setVaultRevealSpin(null);
    flushPendingSpotCelebration();
  }, [flushPendingSpotCelebration]);

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
  const lastStreamStatusRef = useRef<{ health: string; mode: string } | null>(null);
  const reconnectBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectBannerClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshSkewFromServer = useCallback((serverNowMs: number | undefined, clientStartMs: number) => {
    if (typeof serverNowMs !== 'number' || !Number.isFinite(serverNowMs)) return;
    const skew = estimateClockSkewMs(clientStartMs, Date.now(), serverNowMs);
    setClockSkewMs(skew);
  }, []);

  const fetchSnapshot = useCallback(
    async (opts?: { authoritative?: boolean }): Promise<LiveRoomBuyerSnapshot | null> => {
      fetchStartRef.current = Date.now();
      setSyncRefreshing(true);
      try {
        const snap = await fetchLiveRoomBuyerSnapshot(args.accessToken, args.roomId);
        refreshSkewFromServer(snap.serverNowMs, fetchStartRef.current);
        setRoomSnap((prev) => {
          if (opts?.authoritative) {
            logBuyerRoomStateSnapshot('reconcile', snap, {
              lotChanged: false,
              staleIgnored: false,
              advanced: false,
              authoritative: true,
            });
            if (typeof snap.auctionEventSeq === 'number') {
              syncAuctionSeqGuard(guardRef.current, snap.auctionEventSeq);
            }
            return snap;
          }
          const { snap: reconciled, lotChanged, staleIgnored, advanced } = reconcileBuyerSnapshotMonotonic(
            prev,
            snap,
          );
          if (staleIgnored) {
            console.info('[bid] stale snapshot ignored', {
              keptHighBidUsd: prev?.currentBidUsd ?? null,
              incomingHighBidUsd: snap.currentBidUsd,
              activeItemId: snap.activeItemId,
            });
          } else if (lotChanged) {
            console.info('[bid] active lot changed, bid state reset', {
              fromItemId: prev?.activeItemId ?? null,
              toItemId: snap.activeItemId,
              highBidUsd: snap.currentBidUsd,
            });
          } else if (advanced) {
            console.info('[bid] high bid advanced', {
              highBidUsd: reconciled.currentBidUsd,
              minNextBidUsd: reconciled.minNextBidUsd,
              activeItemId: reconciled.activeItemId,
            });
          }
          console.info('[bid] snapshot merge result', {
            lotChanged,
            staleIgnored,
            advanced,
            prevActiveItemId: prev?.activeItemId ?? null,
            nextActiveItemId: snap.activeItemId,
            reconciledActiveItemId: reconciled.activeItemId,
          });
          logBuyerRoomStateSnapshot('reconcile', reconciled, { lotChanged, staleIgnored, advanced });
          if (typeof snap.auctionEventSeq === 'number') {
            syncAuctionSeqGuard(guardRef.current, snap.auctionEventSeq);
          }
          return reconciled;
        });
        return snap;
      } catch {
        return null;
      } finally {
        setSyncRefreshing(false);
      }
    },
    [args.accessToken, args.roomId, refreshSkewFromServer],
  );

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
      const mine = myHighBidUsdRef.current;
      if (!args.userId || mine == null || !snap) return;
      const leader = payload.leadingBidderId ?? payload.bidderId;
      if (leader === args.userId) return;
      const high = payload.amountUsd ?? snap.currentBidUsd;
      if (high == null || high <= mine + 0.01) return;
      setShowOutbidToast(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      if (outbidTimerRef.current) clearTimeout(outbidTimerRef.current);
      outbidTimerRef.current = setTimeout(() => setShowOutbidToast(false), 3200);
    },
    [args.userId],
  );

  const onBidPlaced = useCallback(
    (payload: RoomBroadcastPayload) => {
      if (
        !shouldProcessRealtimeEvent(guardRef.current, 'bid_placed', payload, {
          onAuctionSeqGap: () => scheduleReconcile(90),
        })
      ) {
        return;
      }
      refreshSkewFromRealtime(payload.serverNowMs);
      const skew =
        typeof payload.serverNowMs === 'number'
          ? estimateClockSkewMs(Date.now(), Date.now(), payload.serverNowMs)
          : clockSkewMs;
      const wallNow = syncedWallTimeMs(skew);
      setRoomSnap((prev) => {
        if (!prev) return prev;
        const merged = mergeBuyerSnapshotForBidPlaced(prev, payload, wallNow);
        if (merged && (merged.currentBidUsd ?? 0) > (prev.currentBidUsd ?? 0)) {
          console.info('[bid] high bid advanced', {
            source: 'realtime_bid_placed',
            highBidUsd: merged.currentBidUsd,
            minNextBidUsd: merged.minNextBidUsd,
            activeItemId: merged.activeItemId,
          });
        }
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
      scheduleReconcile(250);
    },
    [clockSkewMs, maybeShowOutbid, refreshSkewFromRealtime, scheduleReconcile],
  );

  const onActiveItemChanged = useCallback(
    (payload: RoomBroadcastPayload) => {
      if (!shouldProcessRealtimeEvent(guardRef.current, 'active_item_changed', payload)) return;
      refreshSkewFromRealtime(payload.serverNowMs);
      const skew =
        typeof payload.serverNowMs === 'number'
          ? estimateClockSkewMs(Date.now(), Date.now(), payload.serverNowMs)
          : clockSkewMs;
      const wallNow = syncedWallTimeMs(skew);
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
      // Always refetch on active_item_changed — variant team pins and spot commerce mode
      // updates are not fully represented in the broadcast payload.
      void fetchSnapshot();
    },
    [clockSkewMs, fetchSnapshot, refreshSkewFromRealtime],
  );

  useRealtimeRoomSubscription({
    liveRoomId: args.enabled ? args.roomId : null,
    enabled: args.enabled && isSupabaseConfigured(),
    includeStaffChat: args.includeStaffChat === true,
    onLiveRoomMessage: (message) => {
      if (message.messageType === 'staff' && !args.includeStaffChat) return;
      args.onChatBroadcast?.(message);
    },
    onMessagesRefreshMerge: () => args.onChatBroadcast?.({ id: '', body: '', messageType: '__refresh__' }),
    onQueueItemsChange: () => scheduleReconcile(120),
    onTeamBreakReady: () => scheduleReconcile(200),
    onTeamBreakBegan: () => scheduleReconcile(200),
    onModerationChanged: () => void args.onModerationChanged?.(),
    onGiveawaysChange: () => scheduleReconcile(250),
    onVaultRevealSpin: (payload) => {
      const spin = parseVaultRevealSpinPayload(payload);
      if (!spin || seenVaultRevealSpinIdsRef.current.has(spin.spinId)) return;
      seenVaultRevealSpinIdsRef.current.add(spin.spinId);
      vaultRevealActiveRef.current = true;
      setVaultRevealSpin(spin);
      scheduleReconcile(250);
    },
    onBreakSpotsChange: () => scheduleReconcile(450),
    onVariantPurchased: (payload) => {
      if (!shouldProcessRealtimeEvent(guardRef.current, 'variant_purchased', payload)) return;
      const taken = parseVariantPurchasedCelebration(payload);
      if (taken) {
        if (payload.randomReveal === true) {
          queueSpotCelebrationAfterReveal(taken);
        } else {
          showSpotCelebration(taken);
        }
      }
      scheduleReconcile(250);
    },
    onListingBid: () => scheduleReconcile(450),
    onTeamBoardChange: () => scheduleReconcile(450),
    onBidPlaced,
    onActiveItemChanged,
    onAuctionStarted: (payload) => {
      if (!shouldProcessRealtimeEvent(guardRef.current, 'auction_started', payload)) return;
      refreshSkewFromRealtime(payload.serverNowMs);
      args.onStreamHardRefresh?.() ?? args.onStreamRefresh?.();
      scheduleReconcile(80);
    },
    onAuctionEnded: (payload) => {
      if (!shouldProcessRealtimeEvent(guardRef.current, 'auction_ended', payload)) return;
      setRoomSnap((prev) => (prev ? { ...prev, status: 'ended' } : prev));
      scheduleReconcile(1000);
    },
    onPurchaseCompleted: (payload) => {
      if (!shouldProcessRealtimeEvent(guardRef.current, 'purchase_completed', payload)) return;
      refreshSkewFromRealtime(payload.serverNowMs);
      if (payload.paymentStatus === 'payment_failed' && payload.winnerId && args.userId && payload.winnerId === args.userId) {
        void fetchSnapshot();
      }
      const wallNow = syncedWallTimeMs(clockSkewMs);
      const viewerWasBidder = myHighBidUsdRef.current != null;
      setMyHighBidUsd(null);
      setRoomSnap((prev) => {
        if (!prev) return prev;
        const noBids = payload.noBids === true;
        const itemSoldOut = payload.itemSoldOut !== false;
        return applyBuyerSnapshotPurchaseCompleted(prev, payload.itemId, wallNow, { noBids, itemSoldOut });
      });
      const parsed = parsePurchaseCompletedCelebration(payload, args.userId);
      const celebration =
        parsed?.kind === 'sold' ? { ...parsed, viewerWasBidder } : parsed;
      if (celebration?.kind === 'sold') setSoldCelebration(celebration);
      const spotTaken = parseAuctionWinSpotCelebration(payload);
      if (spotTaken) showSpotCelebration(spotTaken);
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
    onRoomStateEvent: () => scheduleReconcile(600),
    onReconnect: () => {
      setConnectionBanner('Live connection restored');
      if (reconnectBannerClearTimerRef.current) clearTimeout(reconnectBannerClearTimerRef.current);
      reconnectBannerClearTimerRef.current = setTimeout(() => setConnectionBanner(null), 2400);
      scheduleReconcile(120);
      args.onStreamHardRefresh?.() ?? args.onStreamRefresh?.();
    },
    onStreamStatusChange: (payload) => {
      scheduleReconcile(200);
      const health =
        typeof payload.streamHealth === 'string' ? payload.streamHealth.toLowerCase() : '';
      const mode =
        typeof payload.streamMode === 'string' ? payload.streamMode.toLowerCase() : '';
      const paused =
        typeof payload.streamPaused === 'boolean' ? payload.streamPaused : null;
      const prev = lastStreamStatusRef.current;
      const modeKey = mode || prev?.mode || '';
      const changed = !prev || prev.health !== health || prev.mode !== modeKey;
      lastStreamStatusRef.current = { health, mode: modeKey };
      // Apply pause immediately — don't wait on GET /stream (prefetch cache can lag 5s).
      if (paused != null) {
        args.onStreamPausedHint?.(paused);
      }
      // Host pause/resume must also hard-refresh playback metadata / Stage subscribe.
      if (paused != null || (changed && (health === 'live' || health === 'connecting'))) {
        args.onStreamHardRefresh?.() ?? args.onStreamRefresh?.();
      }
    },
    onConnectionStateChange: ({ status, reconnectCount }) => {
      if (status === 'SUBSCRIBED') {
        realtimeConnectedRef.current = true;
        setConnectionState('connected');
        viewerLifecycleLog('subscription_connected', {
          roomId: args.roomId,
          layer: 'realtime',
          reconnectCount,
        });
        if (reconnectBannerTimerRef.current) {
          clearTimeout(reconnectBannerTimerRef.current);
          reconnectBannerTimerRef.current = null;
        }
        if (reconnectCount > 0) {
          setConnectionBanner('Live connection restored');
          if (reconnectBannerClearTimerRef.current) clearTimeout(reconnectBannerClearTimerRef.current);
          reconnectBannerClearTimerRef.current = setTimeout(() => setConnectionBanner(null), 2400);
        } else {
          setConnectionBanner(null);
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        realtimeConnectedRef.current = false;
        setConnectionState('reconnecting');
        if (!reconnectBannerTimerRef.current) {
          reconnectBannerTimerRef.current = setTimeout(() => {
            reconnectBannerTimerRef.current = null;
            setConnectionBanner('Reconnecting…');
          }, 1_500);
        }
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
    const pollId = setInterval(() => {
      const disconnected = !realtimeConnectedRef.current || !isSupabaseConfigured();
      if (!disconnected) return;
      setConnectionState('polling');
      void fetchSnapshot();
    }, FALLBACK_POLL_DISCONNECTED_MS);
    const reconcileId = setInterval(() => {
      if (!realtimeConnectedRef.current || !isSupabaseConfigured()) return;
      void fetchSnapshot();
    }, FALLBACK_POLL_CONNECTED_MS);
    const skewId = setInterval(() => {
      void refreshSkewFromTimeEndpoint();
    }, SKEW_REFRESH_MS);
    return () => {
      clearInterval(pollId);
      clearInterval(reconcileId);
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
      if (reconnectBannerTimerRef.current) clearTimeout(reconnectBannerTimerRef.current);
      if (reconnectBannerClearTimerRef.current) clearTimeout(reconnectBannerClearTimerRef.current);
      clearPendingSpotCelebrationTimer();
    },
    [clearPendingSpotCelebrationTimer],
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
    clearSoldCelebration,
    spotCelebration,
    showSpotCelebration,
    clearSpotCelebration,
    vaultRevealSpin,
    clearVaultRevealSpin,
    unresolvedPaymentFailure,
    fetchSnapshot,
    syncedNowMs: () => syncedWallTimeMs(clockSkewMs),
    applyOptimisticBid: (args: { itemId: string; amountUsd: number }) => {
      const wallNow = syncedWallTimeMs(clockSkewMs);
      setRoomSnap((prev) => {
        if (!prev) return prev;
        const merged = mergeBuyerSnapshotForOptimisticBid(prev, {
          itemId: args.itemId,
          amountUsd: args.amountUsd,
          wallNowMs: wallNow,
        });
        if (merged && (merged.currentBidUsd ?? 0) > (prev.currentBidUsd ?? 0)) {
          console.info('[bid] high bid advanced', {
            source: 'optimistic_hold',
            highBidUsd: merged.currentBidUsd,
            minNextBidUsd: merged.minNextBidUsd,
            activeItemId: merged.activeItemId,
          });
        }
        return merged ?? prev;
      });
    },
    replaceRoomSnap: (snap: LiveRoomBuyerSnapshot | null) => {
      setRoomSnap(snap);
    },
    mergeBidAck: (ack: LiveBidHttpAck) => {
      refreshSkewFromRealtime(ack.serverNowMs);
      syncAuctionSeqGuard(guardRef.current, ack.auctionSeq);
      const wallNow = syncedWallTimeMs(
        typeof ack.serverNowMs === 'number'
          ? estimateClockSkewMs(Date.now(), Date.now(), ack.serverNowMs)
          : clockSkewMs,
      );
      setRoomSnap((prev) => {
        if (!prev) return prev;
        const merged = mergeBuyerSnapshotForBidAck(prev, ack, wallNow);
        if (merged && (merged.currentBidUsd ?? 0) > (prev.currentBidUsd ?? 0)) {
          console.info('[bid] high bid advanced', {
            source: 'http_ack',
            highBidUsd: merged.currentBidUsd,
            minNextBidUsd: merged.minNextBidUsd,
            activeItemId: merged.activeItemId,
          });
        }
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
    viewerCount,
  };
}
