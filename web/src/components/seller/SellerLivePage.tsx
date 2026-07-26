"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeRoomSubscription } from "@/hooks/useRealtimeRoomSubscription";
import { compressImageFileToBlob } from "@/lib/listing-image-compress";
import { uploadListingImageBlob } from "@/lib/upload-listing-image-client";
import { uploadLiveTeaserFile } from "@/lib/upload-live-teaser-client";
import { logLiveDebugEvent } from "@/lib/live-debug";
import { notifyLiveDiscoveryChanged } from "@/lib/notify-live-discovery-changed";
import type { LiveRoomListApiRow } from "@/lib/live-room-directory-mapper";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import type { LiveShowReadiness } from "@/lib/live-show-readiness-types";
import {
  createLiveRoomItem,
  deleteLiveRoomItem,
  patchLiveRoomAction,
  patchLiveRoomItemStatus,
} from "@/lib/live-room-control-client";
import { LiveShowTipModeratorSettings, patchLiveRoomTipSettings } from "@/components/seller/LiveShowTipModeratorSettings";
import {
  LiveShowShippingSettingsFields,
  defaultLiveShowShippingSettingsValue,
  type LiveShowShippingSettingsValue,
  type PlatformShippingProfileOption,
  type SellerShippingProfileOption,
} from "@/components/shipping/LiveShowShippingSettingsFields";
import { resolveSellerShippingProfileIdForCategory } from "@/lib/live-show-category-shipping-profile";
import { useRequireSellerActivation } from "@/hooks/useRequireSellerActivation";

type RoomTypeChoice = "auction" | "sale" | "break";
type BreakPricingMode = "fixed" | "auction" | "hybrid";

function breakPricingPreviewLabel(mode: BreakPricingMode): string {
  if (mode === "auction") return "Auction spots";
  if (mode === "hybrid") return "Hybrid";
  return "Fixed price";
}

type LiveReadinessApi = LiveShowReadiness & { highValueCheckoutConfigured?: boolean };

const THUMBNAIL_UPLOAD_ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const THUMBNAIL_MAX_FILE_BYTES = 20 * 1024 * 1024;

async function uploadLiveThumbnailBlob(blob: Blob): Promise<string> {
  return uploadListingImageBlob(blob, "live-thumbnail.jpg");
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

const SCHEDULE_MINUTE_OPTIONS = ["00", "15", "30", "45"] as const;

/** Round local time up to the next 15-minute boundary (seconds/ms cleared). */
function alignLocalTimeUpToQuarterHour(d: Date): Date {
  const x = new Date(d.getTime());
  x.setSeconds(0, 0);
  x.setMilliseconds(0);
  const m = x.getMinutes();
  const rem = m % 15;
  if (rem !== 0) x.setMinutes(m + (15 - rem));
  return x;
}

/** Default schedule: ~1 hour from now, snapped up to a 15-minute slot (local). */
function defaultScheduleParts() {
  const d = alignLocalTimeUpToQuarterHour(new Date(Date.now() + 60 * 60 * 1000));
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    hour: pad2(d.getHours()),
    minute: pad2(d.getMinutes()) as (typeof SCHEDULE_MINUTE_OPTIONS)[number],
  };
}

function isQuarterMinute(m: string): m is (typeof SCHEDULE_MINUTE_OPTIONS)[number] {
  return (SCHEDULE_MINUTE_OPTIONS as readonly string[]).includes(m);
}

function formatScheduleDate(d: Date) {
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLocalDateTimePreview(localValue: string) {
  return formatScheduleDate(new Date(localValue));
}

function formatScheduledStartFromIso(iso: string | null) {
  if (!iso) return null;
  const s = formatScheduleDate(new Date(iso));
  return s || null;
}

function IconBreak({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3L20 7v10l-8 4-8-4V7l8-4z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="opacity-90"
      />
      <path d="M12 12l8-5M12 12v10M12 12L4 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconAuction({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 19h16M6 15l4-10 4 3 4-6 2 13H6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSale({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 7h10v10H7zM7 7V5a2 2 0 012-2h6a2 2 0 012 2v2M9 11h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCheck({ done }: { done: boolean }) {
  return (
    <span
      className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-black ${
        done ? "border-gold/50 bg-gold/15 text-gold-bright" : "border-white/15 bg-black/40 text-zinc-600"
      }`}
    >
      {done ? "✓" : ""}
    </span>
  );
}

const CREATE_LIVE_ROOM_DEBUG = process.env.NEXT_PUBLIC_CREATE_LIVE_ROOM_DEBUG === "1";

function logCreateLiveRoom(label: string, data?: Record<string, unknown>) {
  if (!CREATE_LIVE_ROOM_DEBUG) return;
  console.info("[create-live-room]", label, data ?? {});
}

export function SellerLivePage() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { ready: sellerReady, loading: sellerGateLoading } = useRequireSellerActivation();
  const [rooms, setRooms] = useState<LiveRoomListApiRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<LiveRoomItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [thumbDragOver, setThumbDragOver] = useState(false);
  const [thumbUploading, setThumbUploading] = useState(false);
  const [thumbFileName, setThumbFileName] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [vaultCategory, setVaultCategory] = useState<"Cards" | "Helmets">("Cards");
  const [roomType, setRoomType] = useState<RoomTypeChoice>("break");
  const [thumb, setThumb] = useState("");
  const [teaserUrl, setTeaserUrl] = useState("");
  const [teaserDurationMs, setTeaserDurationMs] = useState<number | null>(null);
  const [teaserUploading, setTeaserUploading] = useState(false);
  const [teaserFileName, setTeaserFileName] = useState("");
  const teaserFileRef = useRef<HTMLInputElement>(null);
  const [breakPricingMode, setBreakPricingMode] = useState<BreakPricingMode>("auction");
  const [breakSpotPrice, setBreakSpotPrice] = useState("");
  const [teamBoardEnabled, setTeamBoardEnabled] = useState(true);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [discoveryVisibility, setDiscoveryVisibility] = useState<"public" | "private">("public");
  const [recurringWeekly, setRecurringWeekly] = useState(false);
  const createSubmittingRef = useRef(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleHour, setScheduleHour] = useState("");
  const [scheduleMinute, setScheduleMinute] = useState("");

  const [checkCamera, setCheckCamera] = useState(false);
  const [checkProducts, setCheckProducts] = useState(false);
  const [checkFormat, setCheckFormat] = useState(false);
  const [checkPayments, setCheckPayments] = useState(false);

  const [createTipModeratorId, setCreateTipModeratorId] = useState<string | null>(null);
  const [createTipModeratorUsername, setCreateTipModeratorUsername] = useState("");
  const [createTipsToModerator, setCreateTipsToModerator] = useState(false);
  const [shippingProfiles, setShippingProfiles] = useState<PlatformShippingProfileOption[]>([]);
  const [sellerShippingProfiles, setSellerShippingProfiles] = useState<SellerShippingProfileOption[]>([]);
  const [createShipping, setCreateShipping] = useState<LiveShowShippingSettingsValue>(
    defaultLiveShowShippingSettingsValue(),
  );
  const [editTipModeratorId, setEditTipModeratorId] = useState<string | null>(null);
  const [editTipModeratorUsername, setEditTipModeratorUsername] = useState("");
  const [editTipsToModerator, setEditTipsToModerator] = useState(false);

  const [readiness, setReadiness] = useState<LiveReadinessApi | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const lastRefreshAtRef = useRef<number | null>(null);
  const lastRoomVersionRef = useRef(0);
  const lastItemVersionRef = useRef<Record<string, number>>({});
  const lastEventAtByTypeRef = useRef<Record<string, number>>({});
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const reconnectCountRef = useRef(0);
  const fallbackRefreshTimerRef = useRef<number | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const thumbFileRef = useRef<HTMLInputElement>(null);
  const itemImageFileRef = useRef<HTMLInputElement>(null);

  const [itemTitle, setItemTitle] = useState("");
  const [itemListingId, setItemListingId] = useState("");
  const [itemImage, setItemImage] = useState("");
  const [itemImageUploading, setItemImageUploading] = useState(false);
  const [itemPrice, setItemPrice] = useState("");
  const [itemQuantity, setItemQuantity] = useState("1");
  const [itemStartBid, setItemStartBid] = useState("");
  const [itemTeamBoardMisc, setItemTeamBoardMisc] = useState(false);

  const hostDisplay = useMemo(() => {
    const u = session?.user?.username?.trim();
    if (u) return `@${u}`;
    const n = session?.user?.name?.trim();
    if (n) return n;
    return "Host";
  }, [session?.user?.name, session?.user?.username]);

  const scheduledAtLocal = useMemo(() => {
    if (!scheduleDate.trim() || !scheduleHour.trim() || !scheduleMinute.trim()) return "";
    return `${scheduleDate.trim()}T${scheduleHour}:${scheduleMinute}`;
  }, [scheduleDate, scheduleHour, scheduleMinute]);

  const schedulePreviewLabel = useMemo(() => {
    if (scheduleMode !== "later" || !scheduledAtLocal.trim()) return null;
    const s = formatLocalDateTimePreview(scheduledAtLocal);
    return s ? `Starts ${s}` : null;
  }, [scheduleMode, scheduledAtLocal]);

  const loadLiveReadiness = useCallback(async () => {
    if (!session?.user?.id) return;
    setReadinessLoading(true);
    try {
      const res = await fetch("/api/seller/live-readiness", { cache: "no-store" });
      if (!res.ok) {
        setReadiness(null);
        return;
      }
      const j = (await res.json()) as LiveReadinessApi;
      if (typeof j.canGoLive === "boolean" && j.checks && Array.isArray(j.issues)) {
        setReadiness(j);
      } else {
        setReadiness(null);
      }
    } catch {
      setReadiness(null);
    } finally {
      setReadinessLoading(false);
    }
  }, [session?.user?.id]);

  const loadRooms = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/live-rooms?sellerId=${encodeURIComponent(session.user.id)}&includeEnded=1&limit=40`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const j = (await res.json()) as { rooms?: LiveRoomListApiRow[] };
      const list = Array.isArray(j.rooms) ? j.rooms : [];
      setRooms(list);
      setSelectedId((prev) => {
        if (prev && list.some((r) => r.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  const loadDetail = useCallback(async (roomId: string, opts?: { trustSelection?: boolean }) => {
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}`, { cache: "no-store" });
      if (!res.ok) {
        let msg = `Could not load room (${res.status}).`;
        try {
          const errBody = (await res.json()) as { error?: unknown };
          if (typeof errBody.error === "string" && errBody.error.trim()) msg = errBody.error.trim();
        } catch {
          /* keep default */
        }
        if (selectedIdRef.current === roomId) setCreateError(msg);
        return;
      }
      const j = (await res.json()) as { room?: { items: LiveRoomItemDTO[]; roomVersion?: number } };
      if (!opts?.trustSelection && selectedIdRef.current !== roomId) return;
      setItems(j.room?.items ?? []);
      if (typeof j.room?.roomVersion === "number") {
        lastRoomVersionRef.current = Math.max(lastRoomVersionRef.current, j.room.roomVersion);
      }
      const nextItemVersions: Record<string, number> = {};
      for (const it of j.room?.items ?? []) {
        if (typeof it.itemVersion === "number") nextItemVersions[it.id] = it.itemVersion;
      }
      lastItemVersionRef.current = nextItemVersions;
      lastRefreshAtRef.current = Date.now();
    } catch {
      if (selectedIdRef.current === roomId) setCreateError("Could not load room data. Check your connection and refresh.");
    }
  }, []);

  selectedIdRef.current = selectedId;

  const scheduleFallbackRefresh = useCallback(
    (reason: string, delayMs = 120) => {
      if (fallbackRefreshTimerRef.current != null) window.clearTimeout(fallbackRefreshTimerRef.current);
      fallbackRefreshTimerRef.current = window.setTimeout(() => {
        fallbackRefreshTimerRef.current = null;
        if (!selectedId) return;
        logLiveDebugEvent({
          event: "fallback_refresh",
          roomId: selectedId,
          lastRefreshAtMs: lastRefreshAtRef.current,
          extra: { reason, surface: "seller_live_page" },
        });
        void loadRooms();
        void loadDetail(selectedId);
      }, Math.max(0, delayMs));
    },
    [loadDetail, loadRooms, selectedId],
  );

  const shouldProcessRealtimePayload = useCallback(
    (type: string, payload: Record<string, unknown> | null | undefined) => {
      if (!payload) return true;
      const eventId = typeof payload.eventId === "string" ? payload.eventId : null;
      if (eventId) {
        if (seenEventIdsRef.current.has(eventId)) return false;
        seenEventIdsRef.current.add(eventId);
        if (seenEventIdsRef.current.size > 500) {
          seenEventIdsRef.current = new Set(Array.from(seenEventIdsRef.current).slice(-250));
        }
      }
      const emittedAt = typeof payload.emittedAt === "string" ? payload.emittedAt : null;
      if (emittedAt) {
        const emittedMs = Date.parse(emittedAt);
        if (!Number.isNaN(emittedMs)) {
          const last = lastEventAtByTypeRef.current[type] ?? 0;
          if (emittedMs < last) return false;
          lastEventAtByTypeRef.current[type] = emittedMs;
        }
      }
      const roomVersion = typeof payload.roomVersion === "number" ? payload.roomVersion : null;
      if (roomVersion != null) {
        const lastRoomVersion = lastRoomVersionRef.current;
        if (roomVersion < lastRoomVersion) return false;
        if (roomVersion > lastRoomVersion + 1) scheduleFallbackRefresh(`${type}_room_version_gap`, 80);
        lastRoomVersionRef.current = Math.max(lastRoomVersion, roomVersion);
      }
      const itemId = typeof payload.itemId === "string" ? payload.itemId : null;
      const itemVersion = typeof payload.itemVersion === "number" ? payload.itemVersion : null;
      if (itemId && itemVersion != null) {
        const lastItemVersion = lastItemVersionRef.current[itemId] ?? 0;
        if (itemVersion < lastItemVersion) return false;
        if (itemVersion > lastItemVersion + 1) scheduleFallbackRefresh(`${type}_item_version_gap`, 80);
        lastItemVersionRef.current[itemId] = Math.max(lastItemVersion, itemVersion);
      }
      return true;
    },
    [scheduleFallbackRefresh],
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/signin?returnTo=${encodeURIComponent(pathname || "/seller/live")}`);
    }
  }, [pathname, router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void loadRooms();
    void loadLiveReadiness();
  }, [loadLiveReadiness, loadRooms, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void (async () => {
      try {
        const [platformRes, sellerRes] = await Promise.all([
          fetch("/api/shipping/profiles", { cache: "no-store" }),
          fetch("/api/account/seller/shipping-profiles", { cache: "no-store" }),
        ]);
        if (platformRes.ok) {
          const j = (await platformRes.json()) as { profiles?: PlatformShippingProfileOption[] };
          setShippingProfiles(Array.isArray(j.profiles) ? j.profiles : []);
        }
        if (sellerRes.ok) {
          const j = (await sellerRes.json()) as {
            profiles?: Array<{ id: string; sourceSlug: string; name: string; isDefault?: boolean }>;
          };
          const rows = Array.isArray(j.profiles) ? j.profiles : [];
          setSellerShippingProfiles(rows);
          const defaultProfile = rows.find((p) => p.isDefault) ?? rows[0];
          if (defaultProfile) {
            setCreateShipping((prev) =>
              prev.defaultSellerShippingProfileId
                ? prev
                : { ...prev, defaultSellerShippingProfileId: defaultProfile.id },
            );
          }
        }
      } catch {
        /* optional */
      }
    })();
  }, [status]);

  useEffect(() => {
    if (sellerShippingProfiles.length === 0) return;
    const profileId = resolveSellerShippingProfileIdForCategory(sellerShippingProfiles, vaultCategory);
    if (!profileId) return;
    setCreateShipping((prev) => ({
      ...prev,
      defaultSellerShippingProfileId: profileId,
      defaultShippingProfileId: "",
    }));
  }, [sellerShippingProfiles, vaultCategory]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  useEffect(() => {
    setCreateError(null);
  }, [selectedId]);

  useEffect(() => {
    const r = rooms.find((x) => x.id === selectedId);
    if (!r) return;
    setEditTipModeratorId(r.tipModeratorId ?? null);
    setEditTipModeratorUsername(r.tipModeratorUsername ?? "");
    setEditTipsToModerator(r.tipsToModerator ?? false);
  }, [selectedId, rooms]);

  useEffect(() => {
    if (fallbackRefreshTimerRef.current != null) {
      window.clearTimeout(fallbackRefreshTimerRef.current);
      fallbackRefreshTimerRef.current = null;
    }
  }, [selectedId]);

  useEffect(() => {
    const onVisibilityOrOnline = () => {
      if (!selectedId) return;
      scheduleFallbackRefresh("visibility_or_online", 60);
    };
    document.addEventListener("visibilitychange", onVisibilityOrOnline);
    window.addEventListener("online", onVisibilityOrOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityOrOnline);
      window.removeEventListener("online", onVisibilityOrOnline);
      if (fallbackRefreshTimerRef.current != null) window.clearTimeout(fallbackRefreshTimerRef.current);
    };
  }, [scheduleFallbackRefresh, selectedId]);

  useEffect(() => {
    if (roomType === "break") setCheckFormat(true);
  }, [roomType]);

  const uploadLiveThumbnailFile = async (file: File) => {
    setCreateError(null);
    if (!THUMBNAIL_UPLOAD_ALLOWED.has(file.type)) {
      setCreateError("Use a JPG, PNG, or WebP image for the live tile.");
      return;
    }
    if (file.size > THUMBNAIL_MAX_FILE_BYTES) {
      setCreateError("Thumbnail image must be 20MB or smaller.");
      return;
    }

    setThumbUploading(true);
    try {
      const blob = await compressImageFileToBlob(file, 1280, 0.86);
      const url = await uploadLiveThumbnailBlob(blob);
      setThumb(url);
      setThumbFileName(file.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setCreateError(msg || "Could not upload thumbnail image.");
    } finally {
      setThumbUploading(false);
    }
  };

  const uploadQueueItemThumbnailFile = async (file: File) => {
    setCreateError(null);
    if (!THUMBNAIL_UPLOAD_ALLOWED.has(file.type)) {
      setCreateError("Use a JPG, PNG, or WebP image for the queue thumbnail.");
      return;
    }
    if (file.size > THUMBNAIL_MAX_FILE_BYTES) {
      setCreateError("Thumbnail image must be 20MB or smaller.");
      return;
    }

    setItemImageUploading(true);
    try {
      const blob = await compressImageFileToBlob(file, 1280, 0.86);
      const url = await uploadListingImageBlob(blob, "live-queue-thumbnail.jpg");
      setItemImage(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setCreateError(msg || "Could not upload thumbnail image.");
    } finally {
      setItemImageUploading(false);
    }
  };

  const onThumbDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setThumbDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    void uploadLiveThumbnailFile(f);
  };

  const uploadLiveTeaserVideoFile = async (file: File) => {
    setCreateError(null);
    setTeaserUploading(true);
    try {
      const uploaded = await uploadLiveTeaserFile(file);
      setTeaserUrl(uploaded.url);
      setTeaserDurationMs(uploaded.durationMs);
      setTeaserFileName(file.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setCreateError(msg || "Could not upload teaser video.");
    } finally {
      setTeaserUploading(false);
    }
  };

  const createRoom = async () => {
    logCreateLiveRoom("submit clicked", { scheduleMode, roomType, titleLen: title.trim().length });
    if (createSubmittingRef.current || busy) return;
    if (!title.trim()) {
      setCreateError("Enter a show title before creating a room.");
      return;
    }
    createSubmittingRef.current = true;
    setCreateError(null);
    setBusy(true);
    try {
      let scheduledStartAtIso: string | undefined;
      if (scheduleMode === "later") {
        if (!scheduledAtLocal.trim()) {
          setCreateError("Choose a date and time for your scheduled show.");
          return;
        }
        if (!isQuarterMinute(scheduleMinute)) {
          setCreateError("Pick a start time in 15-minute increments.");
          return;
        }
        const at = new Date(scheduledAtLocal);
        if (Number.isNaN(at.getTime())) {
          setCreateError("That date and time is not valid.");
          return;
        }
        if (at.getTime() < Date.now() + 60 * 1000) {
          setCreateError("Schedule your show at least a minute in the future.");
          return;
        }
        scheduledStartAtIso = at.toISOString();
      }

      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        roomType,
        thumbnailUrl: thumb.trim() || undefined,
        ...(teaserUrl.trim() && teaserDurationMs != null
          ? { teaserVideoUrl: teaserUrl.trim(), teaserVideoDurationMs: teaserDurationMs }
          : {}),
        ...(scheduledStartAtIso ? { scheduledStartAt: scheduledStartAtIso } : {}),
      };
      if (roomType === "break") {
        body.category = vaultCategory;
        body.teamBoardLeague = "nfl";
        body.teamSelectionBoardEnabled = teamBoardEnabled;
        body.breakPricingMode = breakPricingMode;
        if (breakPricingMode === "auction") {
          body.breakSpotPriceUsd = null;
        } else {
          const px = Number(breakSpotPrice);
          body.breakSpotPriceUsd = Number.isFinite(px) && px > 0 ? px : null;
        }
      }
      if (createTipModeratorId) {
        body.tipModeratorId = createTipModeratorId;
        body.tipsToModerator = createTipsToModerator;
      }
      body.shippingMode = createShipping.shippingMode;
      body.carrierPreference = createShipping.carrierPreference;
      body.bundleEligiblePurchases = createShipping.bundleEligiblePurchases;
      if (createShipping.defaultSellerShippingProfileId.trim()) {
        body.defaultSellerShippingProfileId = createShipping.defaultSellerShippingProfileId.trim();
      } else if (createShipping.defaultShippingProfileId.trim()) {
        body.defaultShippingProfileId = createShipping.defaultShippingProfileId.trim();
      }
      body.shippingCapEnabled = createShipping.shippingCapEnabled;
      body.shippingCapCents = createShipping.shippingCapCents;
      body.freeShippingEnabled = createShipping.freeShippingEnabled;
      body.sellerPaysOverCap = createShipping.sellerPaysOverCap;
      if (scheduleMode === "later" && recurringWeekly) {
        body.recurringEnabled = true;
      }
      if (discoveryVisibility === "private") {
        body.discoveryVisibility = "private";
      }

      logCreateLiveRoom("POST /api/live-rooms payload", { body });

      const res = await fetch("/api/live-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const rawText = await res.text();
      let j: {
        id?: string;
        error?: string;
        code?: string;
        detail?: string;
        hint?: string;
        recurringCount?: number;
        prisma?: { name: string; code?: string; message: string; meta?: unknown };
      } = {};
      try {
        j = rawText ? (JSON.parse(rawText) as typeof j) : {};
      } catch {
        j = { error: rawText.slice(0, 200) || "Non-JSON response" };
      }

      logCreateLiveRoom("response", { status: res.status, bodyPreview: rawText.slice(0, 500) });

      if (!res.ok) {
        let msg =
          typeof j.error === "string" && j.error.trim()
            ? j.error.trim()
            : `Could not create room (HTTP ${res.status}).`;
        if (j.code === "SELLER_USER_MISSING_IN_DB") {
          msg = j.error || msg;
        }
        if (j.code === "LIVE_COMING_SOON" || res.status === 503) {
          msg = `${msg} Enable live in .env.local: LIVE_MARKETPLACE_ENABLED=1 (and ensure LIVE_MARKETPLACE_COMING_SOON is not set).`;
        }
        if (j.code === "NO_DATABASE") {
          msg = typeof j.error === "string" ? j.error : msg;
        }
        if (j.prisma) {
          const pr = j.prisma;
          const metaStr = pr.meta != null ? `\n\nMeta:\n${JSON.stringify(pr.meta, null, 2)}` : "";
          msg = `${msg}\n\nPrisma [${pr.code ?? "n/a"}] ${pr.name}\n${pr.message}${metaStr}`;
        } else if (typeof j.detail === "string" && j.detail.trim() && res.status >= 500) {
          msg = `${msg}\n\n${j.detail.trim()}`;
        }
        if (typeof j.hint === "string" && j.hint.trim()) {
          msg = `${msg}\n\nHint: ${j.hint.trim()}`;
        }
        setCreateError(msg);
        return;
      }

      if (!j.id || typeof j.id !== "string") {
        setCreateError("Server returned success but no room id. Check Network → POST /api/live-rooms response.");
        logCreateLiveRoom("missing id in 200 response", { j });
        return;
      }

      const goLater = Boolean(scheduledStartAtIso);
      // Every room type hosts from the seller console (camera stream, queue, auctions, go-live).
      const sellerConsolePath = `/seller/live/${encodeURIComponent(j.id)}/console`;
      logCreateLiveRoom("created", {
        id: j.id,
        goLater,
        recurringCount: j.recurringCount ?? null,
        routerPush: goLater ? null : sellerConsolePath,
      });

      setTitle("");
      setDescription("");
      setThumb("");
      setThumbFileName("");
      setBreakSpotPrice("");
      setTeamBoardEnabled(true);
      setScheduleMode("now");
      setDiscoveryVisibility("public");
      setRecurringWeekly(false);
      setScheduleDate("");
      setScheduleHour("");
      setScheduleMinute("");
      setCheckCamera(false);
      setCheckProducts(false);
      setCheckPayments(false);
      setCreateTipModeratorId(null);
      setCreateTipModeratorUsername("");
      setCreateTipsToModerator(false);
      await loadRooms();
      router.refresh();
      notifyLiveDiscoveryChanged();
      if (goLater) {
        setSelectedId(j.id);
        await loadDetail(j.id, { trustSelection: true });
      } else {
        router.push(sellerConsolePath);
      }
    } finally {
      createSubmittingRef.current = false;
      setBusy(false);
    }
  };

  const saveTipSettings = async () => {
    if (!selectedId) return;
    setBusy(true);
    setCreateError(null);
    try {
      const r = await patchLiveRoomTipSettings(selectedId, {
        tipModeratorId: editTipModeratorId,
        tipsToModerator: editTipsToModerator,
      });
      if (!r.ok) {
        setCreateError(r.error);
        return;
      }
      await loadRooms();
    } finally {
      setBusy(false);
    }
  };

  const patchRoom = async (action: "start" | "end") => {
    if (!selectedId) return;
    setBusy(true);
    setCreateError(null);
    try {
      const j = await patchLiveRoomAction(selectedId, action);
      if (!j.ok) {
        const issueList = j.issues;
        const msg = j.error;
        setCreateError(
          issueList.length > 0
            ? [msg, ...issueList].join("\n\n")
            : msg,
        );
        void loadLiveReadiness();
        return;
      }
      await loadRooms();
      await loadDetail(selectedId, { trustSelection: true });
      void loadLiveReadiness();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const addItem = async () => {
    if (!selectedId) return;
    if (!itemTitle.trim()) {
      setCreateError("Enter a title for the queue item.");
      return;
    }
    if (!itemImage.trim()) {
      setCreateError("Upload 1 thumbnail image.");
      return;
    }
    setCreateError(null);
    setBusy(true);
    try {
      const price = itemPrice.trim() === "" ? null : Number(itemPrice);
      const qtyRaw = itemQuantity.trim() === "" ? 1 : Number(itemQuantity);
      const quantity =
        Number.isFinite(qtyRaw as number) && (qtyRaw as number) >= 1 ? Math.min(512, Math.floor(qtyRaw as number)) : 1;
      const sbRaw = itemStartBid.trim();
      const startingBidUsd =
        sbRaw === ""
          ? 1
          : Number.isFinite(Number(sbRaw)) && Number(sbRaw) > 0
            ? Number(sbRaw)
            : 1;
      const res = await createLiveRoomItem(selectedId, {
        title: itemTitle.trim(),
        listingId: itemListingId.trim() || null,
        imageUrl: itemImage.trim(),
        priceUsd: Number.isFinite(price as number) ? price : null,
        startingBidUsd,
        quantity,
        ...(selected?.roomType === "break" && selected.teamBoardLeague === "nfl" ? { teamBoardMisc: itemTeamBoardMisc } : {}),
      });
      if (res.ok) {
        setCreateError(null);
        setItemTitle("");
        setItemListingId("");
        setItemImage("");
        setItemPrice("");
        setItemQuantity("1");
        setItemStartBid("");
        setItemTeamBoardMisc(false);
        await loadDetail(selectedId, { trustSelection: true });
        router.refresh();
      } else {
        setCreateError(res.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message.trim() : "";
      setCreateError(msg ? `Could not add item (${msg}).` : "Could not add item. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const patchItem = async (itemId: string, st: string) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      if (st !== "queued" && st !== "active" && st !== "sold" && st !== "skipped") return;
      const res = await patchLiveRoomItemStatus(selectedId, itemId, st);
      if (res.ok) {
        await loadDetail(selectedId, { trustSelection: true });
        router.refresh();
      } else {
        setCreateError(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const removeQueueItem = async (itemId: string) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await deleteLiveRoomItem(selectedId, itemId);
      if (res.ok) {
        await loadDetail(selectedId, { trustSelection: true });
        router.refresh();
      } else {
        setCreateError(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  useRealtimeRoomSubscription({
    liveRoomId: selectedId,
    enabled: Boolean(selectedId),
    onLiveRoomMessage: () => {
      /* not used in seller room list */
    },
    onMessagesRefreshMerge: () => {
      /* no-op */
    },
    onQueueItemsChange: () => {
      if (!selectedId) return;
      scheduleFallbackRefresh("queue_items", 120);
    },
    onBreakSpotsChange: () => {
      if (!selectedId) return;
      scheduleFallbackRefresh("break_spots_changed", 80);
    },
    onListingBid: () => {
      if (!selectedId) return;
      scheduleFallbackRefresh("listing_bid", 80);
    },
    onBidPlaced: (payload) => {
      if (!shouldProcessRealtimePayload("bid_placed", payload)) return;
      if (!selectedId) return;
      scheduleFallbackRefresh("bid_placed", 50);
    },
    onActiveItemChanged: (payload) => {
      if (!shouldProcessRealtimePayload("active_item_changed", payload)) return;
      if (!selectedId) return;
      scheduleFallbackRefresh("active_item_changed", 40);
    },
    onAuctionStarted: (payload) => {
      if (!shouldProcessRealtimePayload("auction_started", payload)) return;
      if (!selectedId) return;
      scheduleFallbackRefresh("auction_started", 40);
    },
    onAuctionEnded: (payload) => {
      if (!shouldProcessRealtimePayload("auction_ended", payload)) return;
      if (!selectedId) return;
      scheduleFallbackRefresh("auction_ended", 40);
    },
    onPurchaseCompleted: (payload) => {
      if (!shouldProcessRealtimePayload("purchase_completed", payload)) return;
      if (!selectedId) return;
      scheduleFallbackRefresh("purchase_completed", 40);
    },
    onRoomStateEvent: () => {
      if (!selectedId) return;
      scheduleFallbackRefresh("room_state_event", 100);
    },
    onStreamStatusChange: () => {
      if (!selectedId) return;
      scheduleFallbackRefresh("stream_status", 80);
    },
    onReconnect: () => {
      reconnectCountRef.current += 1;
      if (!selectedId) return;
      logLiveDebugEvent({
        event: "realtime_reconnect",
        roomId: selectedId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { reconnectCount: reconnectCountRef.current, surface: "seller_live_page" },
      });
      scheduleFallbackRefresh("reconnect", 50);
    },
    onConnectionStateChange: ({ status: state, reconnectCount }) => {
      if (!selectedId) return;
      logLiveDebugEvent({
        event: "realtime_connection_state",
        roomId: selectedId,
        lastRefreshAtMs: lastRefreshAtRef.current,
        extra: { status: state, reconnectCount, surface: "seller_live_page" },
      });
    },
  });

  if (status === "loading" || status === "unauthenticated" || sellerGateLoading) {
    return (
      <main className="relative flex min-h-screen w-full flex-1 flex-col bg-zinc-950">
        <div className="mx-auto w-full max-w-[1920px] px-6 py-24 text-center text-sm text-zinc-500 lg:px-10">Loading…</div>
      </main>
    );
  }

  if (!sellerReady) {
    return (
      <main className="relative flex min-h-screen w-full flex-1 flex-col bg-zinc-950">
        <div className="mx-auto w-full max-w-[1920px] px-6 py-24 text-center text-sm text-zinc-500 lg:px-10">Redirecting to seller setup…</div>
      </main>
    );
  }

  const featuredRooms = useMemo(() => {
    // Always surface live + scheduled first so Console is reachable before go-live.
    // Then a few recent ended shows — don't let 30+ ended rooms hide the active ones.
    const active = rooms.filter((r) => r.status === "live" || r.status === "scheduled");
    const ended = rooms.filter((r) => r.status !== "live" && r.status !== "scheduled");
    return [...active, ...ended.slice(0, Math.max(0, 8 - active.length))];
  }, [rooms]);

  const selected = rooms.find((r) => r.id === selectedId);

  const typeCards: {
    id: RoomTypeChoice;
    label: string;
    desc: string;
    icon: React.ReactNode;
    emphasis?: boolean;
  }[] = [
    {
      id: "break",
      label: "Break",
      desc: "Run team-based breaks with live picks and overlays",
      icon: <IconBreak className="size-9 text-gold-bright/95" />,
      emphasis: true,
    },
    {
      id: "auction",
      label: "Auction",
      desc: "Live bidding on lots with real-time energy",
      icon: <IconAuction className="size-9 text-zinc-400" />,
    },
    {
      id: "sale",
      label: "Sale",
      desc: "Buy-now and fixed-price drops in real time",
      icon: <IconSale className="size-9 text-zinc-400" />,
    },
  ];

  const previewThumb = thumb.trim();
  const previewThumbVisual =
    previewThumb.startsWith("https://") ||
    previewThumb.startsWith("http://") ||
    previewThumb.startsWith("data:image") ||
    previewThumb.startsWith("/");

  return (
    <main className="relative flex min-h-screen w-full flex-1 flex-col text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[#030303]" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(250,204,21,0.08),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:56px_56px]"
        aria-hidden
      />
      <div className="relative z-10 flex w-full min-h-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-[1920px] px-6 pb-12 pt-6 lg:px-10">
          <Link
            href="/"
            className="inline-flex text-xs font-semibold tracking-wide text-zinc-500 transition hover:text-gold-bright"
          >
            ← Home
          </Link>

          <div className="mt-6 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
            {/* LEFT ~65–70% */}
            <div className="min-w-0 space-y-8">
            <header className="space-y-3">
              <h1 className="font-display text-3xl font-black tracking-tight text-white sm:text-4xl">Go Live on Get Vaulted</h1>
              <p className="max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg lg:max-w-3xl">
                Set up your break, auction, or live sale and start streaming in seconds.
              </p>
            </header>

            <section className="rounded-2xl border border-white/[0.06] bg-black/35 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Your shows</h2>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {loading ? "Loading…" : `${rooms.length} total`}
                </span>
              </div>
              {loading ? (
                <p className="text-sm text-zinc-500">Loading your created shows…</p>
              ) : rooms.length === 0 ? (
                <p className="text-sm leading-relaxed text-zinc-500">
                  No shows yet. Create one below and it will appear here for quick access and management.
                </p>
              ) : (
                <ul className="space-y-2">
                  {featuredRooms.map((r) => (
                    <li
                      key={`top-${r.id}`}
                      className={`rounded-xl border px-3 py-2.5 transition ${
                        selectedId === r.id
                          ? "border-gold/40 bg-gold/[0.08]"
                          : "border-white/[0.08] bg-zinc-950/50 hover:border-white/20"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(r.id)}
                          className="min-w-0 text-left"
                        >
                          <p className="truncate text-sm font-semibold text-zinc-100">{r.title}</p>
                          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                            {r.roomType} · {r.status}
                            {r.discoveryVisibility === "private" ? " · private" : ""}
                            {r.scheduledStartAt ? ` · ${formatScheduledStartFromIso(r.scheduledStartAt)}` : ""}
                          </p>
                        </button>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/live/${encodeURIComponent(r.id)}`}
                            className="rounded-lg border border-white/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-200 hover:bg-white/[0.06]"
                          >
                            Open
                          </Link>
                          <Link
                            href={`/seller/live/${encodeURIComponent(r.id)}/console`}
                            className="rounded-lg border border-violet-500/35 bg-violet-950/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-200 hover:bg-violet-950/40"
                          >
                            Console
                          </Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {rooms.length > featuredRooms.length ? (
                  <p className="mt-2 text-[10px] text-zinc-600">
                    Showing live &amp; upcoming first · {rooms.length - featuredRooms.length} older ended show
                    {rooms.length - featuredRooms.length === 1 ? "" : "s"} in Manage below
                  </p>
                ) : null}
              )}
            </section>

            <section className="space-y-4 rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-6 shadow-inner shadow-black/30">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold text-white">Go live readiness</h2>
                {readinessLoading ? (
                  <span className="text-xs font-semibold text-zinc-500">Checking…</span>
                ) : readiness?.canGoLive ? (
                  <span className="rounded-full border border-emerald-500/35 bg-emerald-950/40 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-200">
                    Ready
                  </span>
                ) : (
                  <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-gold-bright">
                    Set up required
                  </span>
                )}
              </div>
              <ul className="space-y-3 text-sm">
                <li className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.06] pb-3">
                  <span className="flex items-center gap-2 text-zinc-200">
                    <IconCheck done={Boolean(readiness?.checks.hasStripeAccount && readiness?.checks.stripeChargesEnabled)} />
                    Payouts setup
                  </span>
                  {readiness && !(readiness.checks.hasStripeAccount && readiness.checks.stripeChargesEnabled) ? (
                    <Link href="/account/seller" className="text-xs font-bold text-gold-bright hover:underline">
                      Set up →
                    </Link>
                  ) : null}
                </li>
                <li className="flex flex-wrap items-start justify-between gap-2 pb-0">
                  <span className="flex items-center gap-2 text-zinc-200">
                    <IconCheck done={Boolean(readiness?.checks.hasShipFromAddress)} />
                    Shipping address
                  </span>
                  {readiness && !readiness.checks.hasShipFromAddress ? (
                    <Link href="/account/seller" className="text-xs font-bold text-gold-bright hover:underline">
                      Add →
                    </Link>
                  ) : null}
                </li>
              </ul>

              {readiness && !readiness.canGoLive && readiness.issues.length > 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Almost there</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-300">
                    {readiness.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            {/* Step 1 */}
            <section className="space-y-4">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs font-bold text-gold-bright/90">01</span>
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-500">Room type</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
                {typeCards.map((c) => {
                  const active = roomType === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setRoomType(c.id)}
                      className={`group relative flex flex-col rounded-2xl border p-5 text-left transition duration-200 ${
                        active
                          ? "border-gold/55 bg-gradient-to-b from-gold/[0.12] to-black/60 shadow-[0_0_0_1px_rgba(250,204,21,0.25),0_20px_50px_-24px_rgba(250,204,21,0.35)]"
                          : "border-white/[0.08] bg-zinc-950/80 hover:border-white/20 hover:bg-zinc-900/90"
                      } ${c.emphasis && !active ? "ring-1 ring-gold/10" : ""}`}
                    >
                      <div className="mb-4 flex items-start justify-between gap-2">
                        <span className={active ? "text-gold-bright" : "text-zinc-500 transition group-hover:text-zinc-300"}>{c.icon}</span>
                        {active ? (
                          <span className="rounded-full border border-gold/40 bg-gold/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-gold-bright">
                            Selected
                          </span>
                        ) : null}
                      </div>
                      <p className={`font-display text-lg font-bold ${active ? "text-white" : "text-zinc-200"}`}>{c.label}</p>
                      <p className="mt-2 text-sm leading-snug text-zinc-500 transition group-hover:text-zinc-400">{c.desc}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Step 2 */}
            <section className="space-y-5">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs font-bold text-gold-bright/90">02</span>
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-500">Basic info</h2>
              </div>
              <div className="space-y-6">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">Room title</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Optic Hobby PYT — 32 spots"
                    className="mt-2 w-full rounded-xl border border-white/[0.1] bg-black/50 px-4 py-3.5 text-lg font-medium text-white shadow-inner shadow-black/40 outline-none transition placeholder:text-zinc-600 focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">Description</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="Public blurb for the live directory and schedule (not in-room show notes)."
                    className="mt-2 w-full resize-y rounded-xl border border-white/[0.1] bg-black/50 px-4 py-3 text-sm leading-relaxed text-zinc-100 shadow-inner shadow-black/40 outline-none transition placeholder:text-zinc-600 focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
                  />
                  <p className="mt-1.5 text-[11px] text-zinc-600">
                    In-room show notes for buyers are edited from the host console during the show.
                  </p>
                </label>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">Thumbnail</span>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setThumbDragOver(true);
                    }}
                    onDragLeave={() => setThumbDragOver(false)}
                    onDrop={onThumbDrop}
                    onClick={() => thumbFileRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        thumbFileRef.current?.click();
                      }
                    }}
                    className={`mt-2 rounded-xl border border-dashed px-4 py-6 transition ${
                      thumbDragOver ? "border-gold/50 bg-gold/[0.06]" : "border-white/15 bg-black/40 hover:border-white/25"
                    } ${thumbUploading ? "pointer-events-none opacity-70" : "cursor-pointer"}`}
                  >
                    <input
                      ref={thumbFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void uploadLiveThumbnailFile(f);
                      }}
                    />
                    {previewThumbVisual ? (
                      <div className="mx-auto max-w-xs overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
                        {/* eslint-disable-next-line @next/next/no-img-element -- uploaded public/Supabase URL, simple preview */}
                        <img src={previewThumb} alt="Live tile preview" className="aspect-video w-full object-cover" />
                      </div>
                    ) : (
                      <div className="mx-auto flex max-w-xs flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-zinc-950/50 px-4 py-8 text-center">
                        <span className="flex size-11 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-lg text-gold-bright">
                          +
                        </span>
                        <p className="mt-3 text-sm font-semibold text-zinc-200">Drop your live tile image here</p>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                          Or click to choose a JPG, PNG, or WebP from your computer. This image is saved and used on the
                          live show tile.
                        </p>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-center">
                      <button
                        type="button"
                        disabled={thumbUploading}
                        onClick={(e) => {
                          e.stopPropagation();
                          thumbFileRef.current?.click();
                        }}
                        className="inline-flex min-h-9 items-center rounded-full border border-gold/35 bg-gold/10 px-4 py-2 text-xs font-bold text-gold-bright transition hover:border-gold/55 disabled:opacity-50"
                      >
                        {thumbUploading ? "Uploading…" : previewThumbVisual ? "Replace image" : "Choose image"}
                      </button>
                      {previewThumbVisual ? (
                        <button
                          type="button"
                          disabled={thumbUploading}
                          onClick={(e) => {
                            e.stopPropagation();
                            setThumb("");
                            setThumbFileName("");
                            setCreateError(null);
                          }}
                          className="inline-flex min-h-9 items-center rounded-full border border-white/12 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:border-white/25 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    {thumbFileName ? (
                      <p className="mt-2 truncate text-center text-[11px] text-zinc-500">Uploaded: {thumbFileName}</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-5">
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">Preview video (optional)</span>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                    Short clip with sound (max 15 seconds). Plays on loop when buyers open your scheduled room before you
                    go live. Browse tiles still use your thumbnail image.
                  </p>
                  <input
                    ref={teaserFileRef}
                    type="file"
                    accept="video/mp4,video/quicktime,.mp4,.mov"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void uploadLiveTeaserVideoFile(f);
                    }}
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={teaserUploading}
                      onClick={() => teaserFileRef.current?.click()}
                      className="inline-flex min-h-9 items-center rounded-full border border-gold/35 bg-gold/10 px-4 py-2 text-xs font-bold text-gold-bright transition hover:border-gold/55 disabled:opacity-50"
                    >
                      {teaserUploading ? "Uploading…" : teaserUrl.trim() ? "Replace video" : "Upload video"}
                    </button>
                    {teaserUrl.trim() ? (
                      <button
                        type="button"
                        disabled={teaserUploading}
                        onClick={() => {
                          setTeaserUrl("");
                          setTeaserDurationMs(null);
                          setTeaserFileName("");
                        }}
                        className="inline-flex min-h-9 items-center rounded-full border border-white/12 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:border-white/25 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  {teaserUrl.trim() ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black">
                      <video
                        src={teaserUrl}
                        className="mx-auto max-h-48 w-full object-contain"
                        controls
                        playsInline
                        muted
                        loop
                      />
                      <p className="px-3 py-2 text-[11px] text-zinc-500">
                        {teaserFileName ? `${teaserFileName} · ` : ""}
                        {teaserDurationMs != null ? `${(teaserDurationMs / 1000).toFixed(1)}s` : ""}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-5">
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">Show visibility</span>
                  <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-zinc-950/60 p-1">
                    <button
                      type="button"
                      onClick={() => setDiscoveryVisibility("public")}
                      className={`flex-1 min-w-[140px] min-h-11 rounded-[var(--live-radius-chrome)] px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition-[transform,background-color,opacity] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 ${
                        discoveryVisibility === "public" ? "bg-gold/20 text-gold-bright" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscoveryVisibility("private")}
                      className={`flex-1 min-w-[140px] min-h-11 rounded-[var(--live-radius-chrome)] px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition-[transform,background-color,opacity] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 ${
                        discoveryVisibility === "private" ? "bg-gold/20 text-gold-bright" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      Private
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                    {discoveryVisibility === "public"
                      ? "Public shows appear on the Live Shows tab for all buyers."
                      : "Private shows are hidden from Live Shows and do not notify your followers when you go live. Share your link to invite viewers."}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-5">
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">When to go live</span>
                  <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-zinc-950/60 p-1">
                    <button
                      type="button"
                      onClick={() => setScheduleMode("now")}
                      className={`flex-1 min-w-[140px] min-h-11 rounded-[var(--live-radius-chrome)] px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition-[transform,background-color,opacity] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 ${
                        scheduleMode === "now" ? "bg-gold/20 text-gold-bright" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      Start now
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleMode("later");
                        const d = defaultScheduleParts();
                        setScheduleDate((prev) => prev || d.date);
                        setScheduleHour((prev) => prev || d.hour);
                        setScheduleMinute((prev) => prev || d.minute);
                      }}
                      className={`flex-1 min-w-[140px] min-h-11 rounded-[var(--live-radius-chrome)] px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition-[transform,background-color,opacity] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] active:scale-[0.98] motion-reduce:active:scale-100 ${
                        scheduleMode === "later" ? "bg-gold/20 text-gold-bright" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      Schedule
                    </button>
                  </div>
                  {scheduleMode === "later" ? (
                    <div className="mt-4 space-y-3">
                      <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">Date &amp; time</span>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <label className="block min-w-0 flex-1">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Date</span>
                          <input
                            type="date"
                            value={scheduleDate}
                            onChange={(e) => {
                              setCreateError(null);
                              setScheduleDate(e.target.value);
                            }}
                            className="mt-1 w-full rounded-xl border border-white/[0.1] bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/15 [color-scheme:dark]"
                          />
                        </label>
                        <div className="flex flex-1 flex-wrap items-end gap-2 sm:min-w-[220px]">
                          <label className="min-w-[88px] flex-1">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Hour</span>
                            <select
                              value={scheduleHour}
                              onChange={(e) => {
                                setCreateError(null);
                                setScheduleHour(e.target.value);
                              }}
                              className="mt-1 w-full appearance-none rounded-xl border border-white/[0.1] bg-black/50 px-3 py-3 text-sm text-white outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/15"
                            >
                              {Array.from({ length: 24 }, (_, h) => (
                                <option key={h} value={pad2(h)}>
                                  {pad2(h)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="min-w-[88px] flex-1">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Minute</span>
                            <select
                              value={scheduleMinute}
                              onChange={(e) => {
                                setCreateError(null);
                                setScheduleMinute(e.target.value);
                              }}
                              className="mt-1 w-full appearance-none rounded-xl border border-white/[0.1] bg-black/50 px-3 py-3 text-sm text-white outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/15"
                            >
                              {SCHEDULE_MINUTE_OPTIONS.map((m) => (
                                <option key={m} value={m}>
                                  :{m}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed text-zinc-500">
                        Start times are limited to 15-minute slots. Your room stays scheduled until you start it from
                        Manage below.
                      </p>
                      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-black/30 p-4">
                        <input
                          type="checkbox"
                          checked={recurringWeekly}
                          onChange={(e) => {
                            setCreateError(null);
                            setRecurringWeekly(e.target.checked);
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/50 accent-[#facc15]"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-zinc-200">Repeat weekly</span>
                          <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
                            Schedule the same show every week for up to one month.
                          </span>
                        </span>
                      </label>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-zinc-500">
                      You will open the host console after creation. Start your camera stream from there when you are ready.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Step 3 — break only */}
            {roomType === "break" ? (
              <section className="space-y-5 rounded-2xl border border-white/[0.06] bg-zinc-950/50 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs font-bold text-gold-bright/90">03</span>
                  <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-500">Break setup</h2>
                </div>
                <div className="mt-4 grid gap-6 sm:grid-cols-2">
                  <div className="block sm:col-span-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">Break category</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(["Cards", "Helmets"] as const).map((option) => {
                        const active = vaultCategory === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setVaultCategory(option)}
                            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                              active
                                ? "border-gold/45 bg-gold/15 text-gold-bright"
                                : "border-white/10 bg-black/40 text-zinc-300 hover:border-white/20"
                            }`}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">Shows on live tiles as Break - Cards or Break - Helmets.</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Shipping profile below updates automatically — Cards uses card mailer rates; Helmets uses full-size helmet rates.
                    </p>
                  </div>
                  <div className="block sm:col-span-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">Pricing</span>
                    <div className="mt-2 flex rounded-xl border border-white/10 bg-black/40 p-1">
                      <button
                        type="button"
                        onClick={() => setBreakPricingMode("fixed")}
                        className={`flex-1 rounded-lg px-2 py-2 text-[10px] font-bold uppercase tracking-wide transition sm:px-3 sm:text-xs ${
                          breakPricingMode === "fixed" ? "bg-gold/20 text-gold-bright" : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        Fixed price
                      </button>
                      <button
                        type="button"
                        onClick={() => setBreakPricingMode("auction")}
                        className={`flex-1 rounded-lg px-2 py-2 text-[10px] font-bold uppercase tracking-wide transition sm:px-3 sm:text-xs ${
                          breakPricingMode === "auction" ? "bg-gold/20 text-gold-bright" : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        Auction spots
                      </button>
                      <button
                        type="button"
                        onClick={() => setBreakPricingMode("hybrid")}
                        className={`flex-1 rounded-lg px-2 py-2 text-[10px] font-bold uppercase tracking-wide transition sm:px-3 sm:text-xs ${
                          breakPricingMode === "hybrid" ? "bg-gold/20 text-gold-bright" : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        Hybrid
                      </button>
                    </div>
                  </div>
                  {breakPricingMode === "fixed" || breakPricingMode === "hybrid" ? (
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                        {breakPricingMode === "hybrid" ? "Default spot price (USD, optional)" : "Spot price (USD)"}
                      </span>
                      <input
                        value={breakSpotPrice}
                        onChange={(e) => setBreakSpotPrice(e.target.value)}
                        placeholder="0.00"
                        className="mt-2 w-full rounded-xl border border-white/[0.1] bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/15"
                      />
                    </label>
                  ) : null}
                  {breakPricingMode === "auction" ? (
                    <p className="text-sm text-zinc-500 sm:col-span-2">
                      Spot prices can be set per claim during the show.
                    </p>
                  ) : null}
                  {breakPricingMode === "hybrid" ? (
                    <p className="text-sm text-zinc-500 sm:col-span-2">
                      Run fixed-price team spots and auction lots in the same show. Optional default price applies to PYT tiles; auction lots keep their own bids.
                    </p>
                  ) : null}
                  <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3 sm:col-span-2">
                    <div>
                      <p className="text-sm font-semibold text-zinc-200">Enable team selection board</p>
                      <p className="mt-0.5 text-xs text-zinc-500">PYT tiles for your league — on by default for breaks.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={teamBoardEnabled}
                      onChange={(e) => setTeamBoardEnabled(e.target.checked)}
                      className="size-5 rounded border-white/20 bg-zinc-900 accent-gold"
                    />
                  </label>
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-white/[0.05] bg-zinc-950/30 px-6 py-5">
                <p className="text-sm text-zinc-500">
                  <span className="font-mono text-xs font-bold text-zinc-600">03</span>{" "}
                  <span className="ml-2 font-bold uppercase tracking-[0.15em] text-zinc-600">Break setup</span> — skipped
                  for {roomType === "auction" ? "auction" : "sale"} rooms.
                </p>
              </section>
            )}

            {/* Shipping */}
            <section className="space-y-4 rounded-2xl border border-white/[0.06] bg-zinc-950/50 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs font-bold text-gold-bright/90">
                  {roomType === "break" ? "04" : "03"}
                </span>
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-500">Shipping</h2>
              </div>
              <LiveShowShippingSettingsFields
                sellerProfiles={sellerShippingProfiles}
                platformProfiles={shippingProfiles}
                value={createShipping}
                onChange={setCreateShipping}
                disabled={busy}
              />
            </section>

            {/* Moderator + tip routing */}
            <section className="space-y-4 rounded-2xl border border-white/[0.06] bg-zinc-950/50 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs font-bold text-gold-bright/90">
                  {roomType === "break" ? "05" : "04"}
                </span>
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-500">Moderator & tips</h2>
              </div>
              <LiveShowTipModeratorSettings
                idPrefix="create-tip"
                disabled={busy}
                tipModeratorId={createTipModeratorId}
                tipModeratorUsername={createTipModeratorUsername}
                tipsToModerator={createTipsToModerator}
                onModeratorChange={(id, username) => {
                  setCreateTipModeratorId(id);
                  setCreateTipModeratorUsername(username);
                  if (!id) setCreateTipsToModerator(false);
                }}
                onTipsToModeratorChange={setCreateTipsToModerator}
              />
            </section>

            {/* Step 4 checklist */}
            <section className="space-y-4">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs font-bold text-gold-bright/90">
                  {roomType === "break" ? "06" : "05"}
                </span>
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-500">Pre-live checklist</h2>
              </div>
              <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-zinc-900/40 to-black/40 p-5">
                {(
                  [
                    ["Camera ready", checkCamera, setCheckCamera],
                    ["Products ready", checkProducts, setCheckProducts],
                    [
                      roomType === "break" ? "Break format selected" : "Room format selected",
                      checkFormat,
                      setCheckFormat,
                    ],
                    ["Payments enabled", checkPayments, setCheckPayments],
                  ] as const
                ).map(([label, val, setVal]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setVal(!val)}
                    className="flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-white/[0.06] hover:bg-white/[0.03]"
                  >
                    <IconCheck done={val} />
                    <span className={`text-sm font-medium ${val ? "text-zinc-100" : "text-zinc-500"}`}>{label}</span>
                  </button>
                ))}
              </div>
            </section>

            {createError ? (
              <p className="whitespace-pre-wrap break-words rounded-xl border border-rose-500/30 bg-rose-950/40 px-4 py-3 text-left text-sm text-rose-100">
                {createError}
              </p>
            ) : null}

            <button
              type="button"
              disabled={busy || thumbUploading || teaserUploading || !title.trim()}
              title={!title.trim() ? "Enter a show title to enable this button" : undefined}
              onClick={() => void createRoom()}
              className="w-full rounded-2xl bg-gradient-to-r from-gold/90 via-amber-300 to-gold/85 py-4 text-center font-display text-base font-black uppercase tracking-wide text-zinc-950 shadow-[0_12px_40px_-12px_rgba(250,204,21,0.55)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy
                ? "Creating…"
                : scheduleMode === "later"
                  ? "Schedule live room"
                  : "Create & Enter Live Room"}
            </button>
          </div>

          {/* RIGHT ~30–35% */}
          <aside className="min-w-0 space-y-6 xl:sticky xl:top-24 xl:self-start">
              <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/90 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.04]">
                <div className="relative aspect-video bg-gradient-to-br from-zinc-900 via-black to-zinc-950">
                  {previewThumbVisual ? (
                    <div
                      className="absolute inset-0 bg-cover bg-center opacity-35"
                      style={{ backgroundImage: `url(${JSON.stringify(previewThumb)})` }}
                      aria-hidden
                    />
                  ) : null}
                  <div className="relative z-[1] flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                    {scheduleMode === "later" && schedulePreviewLabel ? (
                      <div className="rounded-full border border-gold/35 bg-gold/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-gold-bright ring-1 ring-gold/25">
                        Scheduled
                      </div>
                    ) : (
                      <div className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-red-400 ring-1 ring-red-500/30">
                        Live
                      </div>
                    )}
                    <p className="font-display text-lg font-bold text-white line-clamp-2 drop-shadow-md">
                      {title.trim() || "Your show title"}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400 drop-shadow">
                      {roomType === "break" ? "Break" : roomType === "auction" ? "Auction" : "Sale"}
                      {roomType === "break"
                        ? ` · ${breakPricingPreviewLabel(breakPricingMode)}`
                        : ""}
                      {scheduleMode === "later" ? " · Scheduled start" : " · Start now"}
                    </p>
                    <p className="text-xs text-gold-bright/90 drop-shadow">{hostDisplay}</p>
                    {schedulePreviewLabel ? (
                      <p className="text-[11px] font-semibold text-amber-200/90 drop-shadow">{schedulePreviewLabel}</p>
                    ) : null}
                    <p className="mt-1 max-w-[240px] text-[11px] leading-relaxed text-zinc-400 drop-shadow">
                      {scheduleMode === "later"
                        ? "You will finish setup in the room; go live when you are ready."
                        : "Your stream will appear here once you go live from the room."}
                    </p>
                  </div>
                </div>
                <div className="border-t border-white/[0.06] px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Preview</p>
                  <p className="mt-1 truncate text-xs text-zinc-400">
                    {roomType === "break" ? "Break" : roomType === "auction" ? "Auction" : "Sale"}
                    {roomType === "break"
                      ? ` · ${breakPricingPreviewLabel(breakPricingMode)}`
                      : ""}
                    {scheduleMode === "later" ? " · Scheduled" : " · Start now"}
                  </p>
                </div>
              </div>

            <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/70 p-5 shadow-inner shadow-black/30">
              <h3 className="font-display text-sm font-bold text-gold-bright/95">Pro tips for going live</h3>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-400">
                <li className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold/60" />
                  Explain rules before you start — clarity keeps the room confident.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold/60" />
                  Keep energy high during picks; call the next spot before silence lands.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold/60" />
                  Call out big hits for clips — your buyers are your marketing crew.
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-black/35 p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Your shows</h3>
              {loading ? (
                <p className="mt-3 text-sm text-zinc-500">Loading…</p>
              ) : rooms.length === 0 ? (
                <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                  Your scheduled and live shows land here. Use <span className="font-semibold text-zinc-400">Schedule</span>{" "}
                  for a future slot, or <span className="font-semibold text-zinc-400">Start now</span> to jump in
                  immediately — then queue products from Manage.
                </p>
              ) : (
                <ul className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
                  {rooms.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        className={`w-full rounded-xl border px-3 py-2.5 text-left text-xs transition ${
                          selectedId === r.id
                            ? "border-gold/40 bg-gold/[0.08] text-zinc-100"
                            : "border-white/[0.06] bg-zinc-950/50 text-zinc-400 hover:border-white/15"
                        }`}
                      >
                        <span className="font-semibold text-zinc-100">{r.title}</span>
                        <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-zinc-500">
                          {r.roomType} · {r.status}
                          {r.scheduledStartAt ? ` · ${formatScheduledStartFromIso(r.scheduledStartAt)}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>

        {/* Manage existing room */}
        {selected ? (
          <section className="mt-10 space-y-6 rounded-2xl border border-white/[0.08] bg-[#08080c]/90 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-[var(--live-blur-md)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold text-white">Manage · {selected.title}</h2>
                {selected.scheduledStartAt && selected.status !== "live" ? (
                  <p className="mt-1 text-sm text-amber-200/85">
                    Scheduled · {formatScheduledStartFromIso(selected.scheduledStartAt)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <button
                  data-testid="seller-start-live"
                  type="button"
                  disabled={
                    busy ||
                    selected.status === "live" ||
                    readinessLoading ||
                    readiness === null ||
                    (readiness && !readiness.canGoLive)
                  }
                  onClick={() => void patchRoom("start")}
                  title={
                    readiness && !readiness.canGoLive
                      ? "Complete readiness checklist before starting your live show."
                      : undefined
                  }
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--live-radius-chrome)] border border-emerald-500/35 bg-emerald-950/30 px-4 py-2.5 text-xs font-bold text-emerald-200 transition-[transform,background-color,opacity] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] hover:bg-emerald-500/10 active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-40 sm:w-auto sm:min-h-10 sm:py-2"
                >
                  Start live show
                </button>
                <button
                  data-testid="seller-end-live"
                  type="button"
                  disabled={busy || selected.status === "ended"}
                  onClick={() => void patchRoom("end")}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--live-radius-chrome)] border border-rose-500/35 bg-rose-950/25 px-4 py-2.5 text-xs font-bold text-rose-200 transition-[transform,background-color,opacity] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] hover:bg-rose-500/10 active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-40 sm:w-auto sm:min-h-10 sm:py-2"
                >
                  End
                </button>
                <Link
                  href={`/live/${encodeURIComponent(selected.id)}`}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--live-radius-chrome)] border border-white/15 px-4 py-2.5 text-xs font-bold text-gold-bright transition-[transform,background-color,opacity] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] hover:bg-white/[0.05] active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-40 sm:w-auto sm:min-h-10 sm:py-2"
                >
                  Open room
                </Link>
                <Link
                  href={`/seller/live/${encodeURIComponent(selected.id)}/console`}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--live-radius-chrome)] border border-violet-500/35 bg-violet-950/25 px-4 py-2.5 text-xs font-bold text-violet-200 transition-[transform,background-color,opacity] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] hover:bg-violet-950/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-40 sm:w-auto sm:min-h-10 sm:py-2"
                >
                  Host console
                </Link>
              </div>
            </div>

            {createError ? (
              <p className="whitespace-pre-wrap break-words rounded-xl border border-rose-500/30 bg-rose-950/40 px-4 py-3 text-left text-sm text-rose-100">
                {createError}
              </p>
            ) : null}

            <div className="rounded-xl border border-violet-500/20 bg-violet-950/15 p-4">
              <p className="text-sm leading-relaxed text-zinc-300">
                Camera and OBS streaming live in the{" "}
                <span className="font-semibold text-violet-200">Host console</span> — open it when you are ready to go
                live, then use <span className="font-semibold text-gold-bright">Start Stream</span>.
              </p>
              <Link
                href={`/seller/live/${encodeURIComponent(selected.id)}/console`}
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl border border-violet-500/35 bg-violet-950/30 px-4 text-xs font-bold text-violet-100 hover:bg-violet-950/45"
              >
                Open host console
              </Link>
            </div>

            {selected.status !== "ended" ? (
              <section className="space-y-4 rounded-xl border border-white/[0.06] p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Moderator & tips</h3>
                <LiveShowTipModeratorSettings
                  idPrefix="edit-tip"
                  disabled={busy}
                  tipModeratorId={editTipModeratorId}
                  tipModeratorUsername={editTipModeratorUsername}
                  tipsToModerator={editTipsToModerator}
                  onModeratorChange={(id, username) => {
                    setEditTipModeratorId(id);
                    setEditTipModeratorUsername(username);
                    if (!id) setEditTipsToModerator(false);
                  }}
                  onTipsToModeratorChange={setEditTipsToModerator}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveTipSettings()}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gold/35 bg-gold/10 px-4 text-xs font-bold text-gold-bright transition hover:bg-gold/15 disabled:opacity-50"
                >
                  Save tip settings
                </button>
              </section>
            ) : null}

            <form
              className="rounded-xl border border-white/[0.06] p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (busy) return;
                void addItem();
              }}
            >
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Queue item</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  placeholder="Title"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-zinc-100 sm:col-span-2"
                />
                <input
                  placeholder="Listing id (optional)"
                  value={itemListingId}
                  onChange={(e) => setItemListingId(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-zinc-100 sm:col-span-2"
                />
                <div className="sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Thumbnail</span>
                  <div
                    onClick={() => !itemImage && itemImageFileRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && !itemImage) {
                        e.preventDefault();
                        itemImageFileRef.current?.click();
                      }
                    }}
                    className={`mt-2 rounded-xl border border-dashed px-4 py-4 transition ${
                      itemImage ? "border-white/10 bg-black/30" : "cursor-pointer border-white/15 bg-black/40 hover:border-white/25"
                    } ${itemImageUploading ? "pointer-events-none opacity-70" : ""}`}
                  >
                    <input
                      ref={itemImageFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void uploadQueueItemThumbnailFile(f);
                      }}
                    />
                    {itemImage.trim() ? (
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element -- uploaded queue thumbnail */}
                        <img src={itemImage} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-zinc-200">Thumbnail uploaded</p>
                          <p className="mt-0.5 text-[11px] text-zinc-500">Used on auction cards, queue, and pinned item.</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            itemImageFileRef.current?.click();
                          }}
                          className="rounded-lg border border-white/12 px-2 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-white/[0.06]"
                        >
                          Replace
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-2 text-center">
                        <p className="text-sm font-semibold text-zinc-200">Upload thumbnail</p>
                        <p className="mt-1 text-[11px] text-zinc-500">Upload 1 thumbnail image · JPG, PNG, or WebP</p>
                      </div>
                    )}
                  </div>
                </div>
                <input
                  placeholder="Buy now USD"
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-zinc-100"
                />
                <label className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Quantity</label>
                <input
                  inputMode="numeric"
                  min={1}
                  placeholder="1"
                  aria-label="Quantity"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(e.target.value.replace(/[^\d]/g, ""))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-zinc-100"
                />
                <input
                  placeholder="Starting bid USD (default 1.00)"
                  value={itemStartBid}
                  onChange={(e) => setItemStartBid(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-zinc-100 sm:col-span-2"
                />
                <p className="text-xs text-zinc-500 sm:col-span-2">
                  Quantity creates numbered units, like PYT Break 1 #1, #2, #3.
                </p>
                {selected.roomType === "break" && selected.teamBoardLeague === "nfl" ? (
                  <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={itemTeamBoardMisc}
                      onChange={(e) => setItemTeamBoardMisc(e.target.checked)}
                      className="rounded border-white/20 bg-black/50 accent-gold"
                    />
                    <span className="text-xs text-zinc-400">MISC spot (NFL team board while this item is active)</span>
                  </label>
                ) : null}
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-3 rounded-[var(--live-radius-chrome)] border border-white/12 bg-white/[0.06] px-4 py-2 text-xs font-bold text-zinc-200 transition-[transform,background-color,opacity] duration-[var(--live-duration-ui)] ease-[var(--live-ease)] hover:bg-white/10 active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-40"
              >
                {busy ? "Adding…" : "Add to queue"}
              </button>
            </form>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Queue</h3>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                <span className="font-semibold text-zinc-400">Post</span> puts the lot on everyone&apos;s screen in this room (starting bid
                shown). Bidding stays closed until the show is live. <span className="font-semibold text-zinc-400">Delete</span> removes the
                row.
              </p>
              <ul className="mt-2 space-y-2 text-sm text-zinc-300">
                {items.length === 0 ? <li className="text-zinc-500">No items yet.</li> : null}
                {items.map((it) => (
                  <li
                    key={it.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2"
                  >
                    <span>
                      {it.displayTitle ?? it.title}
                      {it.progressLabel ? <span className="text-zinc-400"> · {it.progressLabel}</span> : null}{" "}
                      <span className="text-zinc-500">
                        ({it.status}){it.currentBidUsd != null ? ` · bid ${it.currentBidUsd}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {it.status !== "active" && it.status !== "sold" && it.status !== "skipped" ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-lg border border-violet-500/35 bg-violet-950/30 px-2.5 py-1 text-[10px] font-bold text-violet-100 transition hover:bg-violet-950/50 disabled:opacity-40"
                          onClick={() => void patchItem(it.id, "active")}
                        >
                          Post
                        </button>
                      ) : null}
                      {it.status !== "sold" && it.status !== "skipped" ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-lg border border-amber-500/30 bg-amber-950/25 px-2.5 py-1 text-[10px] font-semibold text-amber-100 transition hover:bg-amber-950/40 disabled:opacity-40"
                          onClick={() => void patchItem(it.id, "skipped")}
                        >
                          Skip
                        </button>
                      ) : null}
                      {it.status !== "sold" ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-lg border border-rose-500/30 bg-rose-950/25 px-2.5 py-1 text-[10px] font-semibold text-rose-200 transition hover:bg-rose-950/40 disabled:opacity-40"
                          onClick={() => void removeQueueItem(it.id)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
        </div>
      </div>
    </main>
  );
}
