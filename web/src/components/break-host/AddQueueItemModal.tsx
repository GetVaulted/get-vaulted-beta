"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { compressImageFileToBlob } from "@/lib/listing-image-compress";
import { uploadListingImageBlob } from "@/lib/upload-listing-image-client";
import {
  LIVE_BOARD_PACKS,
  DEFAULT_LIVE_BOARD_PACK,
  boardPackSupportsDivisions,
  buildRandomVariantsFromPreset,
  buildVariantsFromPreset,
  parseLiveBoardPack,
  teamsPresetIdForBoardPack,
  type LiveBoardPackId,
  type VariantDraftInput,
} from "@/lib/live-item-variant-presets";
import { TEAM_BOARD_LEAGUE_LABELS, teamBoardSpotCount } from "@/lib/team-board-sets";
import {
  withNcaaBuyableSpot,
  withNcaaRandomPoolSeat,
  stripNcaaSpotVariants,
} from "@/lib/nfl-ncaa-spot";
import { LiveItemVariantBuilder } from "@/components/live-auction/LiveItemVariantBuilder";
import { resolveLiveHostDefaultShippingProfileId } from "@/lib/live-show-category-shipping-profile";
import { SELLER_CONSOLE } from "@/lib/seller-console-copy";
import {
  fetchLiveRoomShopInventory,
  fetchPriorLiveRoomsForCopy,
  type LiveShopInventoryListing,
  type PriorLiveRoomOption,
} from "@/lib/live-room-control-client";
import { RANDOM_BREAK_SALE_TYPES_ENABLED } from "../../../../shared/live-break-feature-flags";
import {
  buildPlayerPickVariants,
  buildRandomPlayerVariant,
  parsePlayerSpotList,
  PLAYER_SPOT_MAX,
} from "../../../../shared/live-player-spot-list";

export type AddQueueItemCloseReason = "cancel" | "success" | "escape";

export type AddQueueItemAuctionPayload = {
  title: string;
  imageUrl: string;
  priceUsd: number | null;
  startingBidUsd: number;
  quantity: number;
  salesFormat: "auction" | "buy_now" | "variant_selection" | "team_break" | "player_selection";
  variantAssignmentMode?: "pick" | "random";
  variants: VariantDraftInput[];
  teamBoardMisc: boolean;
  teamBoardNcaa: boolean;
  customRandomPoolLabels?: string[] | null;
  sellerShippingProfileId?: string | null;
  shippingProfileId?: string | null;
};

import type { LiveGiveawayKind } from "@/lib/seller-queue-tabs";
import type { SellerQueueAddModalMode } from "@/lib/seller-queue-tabs";
import { GIVVY_DEFAULT_BUYERS_RULES_TEXT } from "@/lib/givvy-ui";

export type AddQueueItemGiveawayPayload = {
  kind: LiveGiveawayKind;
  title: string;
  prizeDescription: string;
  imageUrl: string;
  rulesText: string;
  openEntries: boolean;
};

type Props = {
  open: boolean;
  mode: SellerQueueAddModalMode;
  liveRoomId: string;
  teamBoardLeague?: string | null;
  busy?: boolean;
  onRequestClose: (reason: AddQueueItemCloseReason) => void;
  onSubmitAuction: (payload: AddQueueItemAuctionPayload) => Promise<boolean>;
  onSubmitGiveaway?: (payload: AddQueueItemGiveawayPayload) => Promise<boolean>;
  /** Pull one or more seller shop listings into the current room queue. */
  onSubmitFromShop?: (listingIds: string[]) => Promise<boolean>;
  /** Clone unsold queue rows from a prior room. */
  onImportFromPriorRoom?: (sourceRoomId: string) => Promise<boolean>;
};

const ALLOWED_CLOSE: AddQueueItemCloseReason[] = ["cancel", "success", "escape"];
const THUMBNAIL_UPLOAD_ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const THUMBNAIL_MAX_FILE_BYTES = 20 * 1024 * 1024;

type SaleCategory = "teams_divisions" | "auction" | "buy_now";
type BreakSaleType = "pyt" | "pyd" | "pyp" | "random_pyt" | "random_pyd" | "random_pyp";
type SaleType = "auction" | "buy_now" | BreakSaleType;
type AddSourceTab = "new" | "shop" | "copy";

const SALE_CATEGORIES: { id: SaleCategory; label: string; sub: string }[] = [
  {
    id: "teams_divisions",
    label: SELLER_CONSOLE.saleCategoryTeamsDivisions,
    sub: RANDOM_BREAK_SALE_TYPES_ENABLED ? "Pick or random spots" : "Teams, divisions, or players",
  },
  { id: "auction", label: SELLER_CONSOLE.saleCategoryAuction, sub: "Timed bidding" },
  { id: "buy_now", label: SELLER_CONSOLE.saleCategoryBuyNow, sub: "Fixed price" },
];

const BREAK_VARIANTS: { id: BreakSaleType; label: string; sub: string }[] = [
  { id: "pyt", label: "PYT", sub: "Pick your team" },
  { id: "pyd", label: "PYD", sub: "Pick division · NFL" },
  { id: "pyp", label: "PYP", sub: "Pick your player" },
  { id: "random_pyt", label: "Random Teams", sub: "Vault reveal" },
  { id: "random_pyd", label: "Random Divisions", sub: "8 · NFL" },
  { id: "random_pyp", label: "Random Players", sub: "Vault reveal" },
];

function visibleBreakVariants(boardPack: LiveBoardPackId) {
  const base = RANDOM_BREAK_SALE_TYPES_ENABLED
    ? BREAK_VARIANTS
    : BREAK_VARIANTS.filter((v) => v.id === "pyt" || v.id === "pyd" || v.id === "pyp");
  if (boardPackSupportsDivisions(boardPack)) return base;
  return base.filter(
    (v) => v.id === "pyt" || v.id === "pyp" || v.id === "random_pyt" || v.id === "random_pyp",
  );
}
function saleTypeForCategory(category: SaleCategory, breakVariant: BreakSaleType): SaleType {
  if (category === "auction") return "auction";
  if (category === "buy_now") return "buy_now";
  return breakVariant;
}

function requestClose(reason: string, onRequestClose: (reason: AddQueueItemCloseReason) => void) {
  const allowed = ALLOWED_CLOSE.includes(reason as AddQueueItemCloseReason);
  if (!allowed) return;
  onRequestClose(reason as AddQueueItemCloseReason);
}

function parseUsd(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function AddQueueItemModal({
  open,
  mode,
  liveRoomId,
  teamBoardLeague,
  busy = false,
  onRequestClose,
  onSubmitAuction,
  onSubmitGiveaway,
  onSubmitFromShop,
  onImportFromPriorRoom,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [addSource, setAddSource] = useState<AddSourceTab>("new");
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saleCategory, setSaleCategory] = useState<SaleCategory>("auction");
  const [breakSaleType, setBreakSaleType] = useState<BreakSaleType>("pyt");
  const saleType = saleTypeForCategory(saleCategory, breakSaleType);
  const [boardPack, setBoardPack] = useState<LiveBoardPackId>(DEFAULT_LIVE_BOARD_PACK);
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [queueDraftMisc, setQueueDraftMisc] = useState(false);
  const [queueDraftNcaa, setQueueDraftNcaa] = useState(false);
  const [playerListText, setPlayerListText] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [prizeDescription, setPrizeDescription] = useState("");
  const [openEntriesOnCreate, setOpenEntriesOnCreate] = useState(true);
  const [profileOptions, setProfileOptions] = useState<{ id: string; name: string; isDefault?: boolean }[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileOptionsAreSeller, setProfileOptionsAreSeller] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [spotVariants, setSpotVariants] = useState<VariantDraftInput[]>([]);
  const [spotsCustomized, setSpotsCustomized] = useState(false);
  const [shopListings, setShopListings] = useState<LiveShopInventoryListing[]>([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
  const [shopQuery, setShopQuery] = useState("");
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const [priorRooms, setPriorRooms] = useState<PriorLiveRoomOption[]>([]);
  const [priorLoading, setPriorLoading] = useState(false);
  const [priorError, setPriorError] = useState<string | null>(null);
  const [selectedPriorRoomId, setSelectedPriorRoomId] = useState("");
  const wasOpenRef = useRef(false);
  const imageFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setAddSource("new");
      setTitle("");
      setImageUrl("");
      setImageUploading(false);
      setImageError(null);
      setSaleCategory(mode === "bin" ? "buy_now" : "auction");
      setBreakSaleType("pyt");
      setBoardPack(parseLiveBoardPack(teamBoardLeague) || DEFAULT_LIVE_BOARD_PACK);
      setPrice("");
      setQuantity("1");
      setQueueDraftMisc(false);
      setQueueDraftNcaa(false);
      setPlayerListText("");
      // Buyers giveaways require 80+ characters of official rules before they can be created —
      // prefill boilerplate so the host edits/confirms it instead of starting from a blank box.
      setRulesText(mode === "buyers_giveaway" ? GIVVY_DEFAULT_BUYERS_RULES_TEXT : "");
      setPrizeDescription("");
      setOpenEntriesOnCreate(true);
      setFormError(null);
      setSelectedProfileId("");
      setSpotVariants([]);
      setSpotsCustomized(false);
      setShopListings([]);
      setShopError(null);
      setShopQuery("");
      setSelectedShopIds([]);
      setPriorRooms([]);
      setPriorError(null);
      setSelectedPriorRoomId("");
    }
    wasOpenRef.current = open;
  }, [mode, open]);

  useEffect(() => {
    if (!open || !liveRoomId.trim() || addSource !== "shop") return;
    let cancelled = false;
    setShopLoading(true);
    setShopError(null);
    void fetchLiveRoomShopInventory(liveRoomId).then((res) => {
      if (cancelled) return;
      setShopLoading(false);
      if (!res.ok) {
        setShopError(res.error);
        setShopListings([]);
        return;
      }
      setShopListings(res.data.listings);
    });
    return () => {
      cancelled = true;
    };
  }, [addSource, liveRoomId, open]);

  useEffect(() => {
    if (!open || !liveRoomId.trim() || addSource !== "copy") return;
    let cancelled = false;
    setPriorLoading(true);
    setPriorError(null);
    void fetchPriorLiveRoomsForCopy(liveRoomId).then((res) => {
      if (cancelled) return;
      setPriorLoading(false);
      if (!res.ok) {
        setPriorError(res.error);
        setPriorRooms([]);
        return;
      }
      setPriorRooms(res.data.rooms);
      setSelectedPriorRoomId((prev) => prev || res.data.rooms[0]?.id || "");
    });
    return () => {
      cancelled = true;
    };
  }, [addSource, liveRoomId, open]);

  useEffect(() => {
    if (!open || !liveRoomId.trim()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/host-shipping`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          room?: {
            category?: string | null;
            defaultSellerShippingProfileId?: string | null;
            defaultShippingProfileId?: string | null;
          };
          sellerProfiles?: { id: string; sourceSlug: string; name: string; isDefault?: boolean }[];
          profiles?: { id: string; name: string; slug?: string }[];
        };
        const options =
          data.sellerProfiles && data.sellerProfiles.length > 0
            ? data.sellerProfiles
            : (data.profiles ?? []).map((p) => ({
                id: p.id,
                sourceSlug: p.slug ?? "",
                name: p.name,
              }));
        const defaultId = resolveLiveHostDefaultShippingProfileId({
          profiles: options,
          roomDefaultSellerShippingProfileId: data.room?.defaultSellerShippingProfileId,
          roomDefaultShippingProfileId: data.room?.defaultShippingProfileId,
          category: data.room?.category ?? null,
        }) || options[0]?.id || "";
        if (!cancelled) {
          setProfileOptions(options);
          setProfileOptionsAreSeller(Boolean(data.sellerProfiles?.length));
          setSelectedProfileId(defaultId);
        }
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liveRoomId, open]);

  useEffect(() => {
    if (saleType === "pyp") {
      const base = parseUsd(price);
      const parsed = parsePlayerSpotList(playerListText);
      if (base == null || !parsed.ok) {
        setSpotVariants([]);
        return;
      }
      setSpotVariants((prev) => {
        const priceByName = new Map(prev.map((s) => [s.label.trim().toLowerCase(), s.priceUsd]));
        return buildPlayerPickVariants(
          parsed.names,
          base,
          spotsCustomized ? priceByName : undefined,
        );
      });
      return;
    }
    if (saleType !== "pyt" && saleType !== "pyd") {
      setSpotVariants([]);
      return;
    }
    const base = parseUsd(price);
    if (base == null) {
      setSpotVariants([]);
      return;
    }
    const teamsPreset = teamsPresetIdForBoardPack(boardPack);
    setSpotVariants((prev) => {
      const coreCount = saleType === "pyt" ? teamBoardSpotCount(boardPack) : 8;
      const wantNcaa = saleType === "pyt" && boardPack === "nfl" && queueDraftNcaa;
      const expected = coreCount + (wantNcaa ? 1 : 0);
      let next: VariantDraftInput[];
      if (prev.length === expected && spotsCustomized) {
        next = wantNcaa
          ? withNcaaBuyableSpot(stripNcaaSpotVariants(prev), base)
          : stripNcaaSpotVariants(prev);
        return next;
      }
      next = buildVariantsFromPreset(saleType === "pyt" ? teamsPreset : "nfl_divisions", base, 1);
      if (wantNcaa) next = withNcaaBuyableSpot(next, base);
      else next = stripNcaaSpotVariants(next);
      if (spotsCustomized) {
        const byKey = new Map(prev.map((s) => [(s.color || s.label).toUpperCase(), s.priceUsd]));
        next = next.map((s) => ({
          ...s,
          priceUsd: byKey.get((s.color || s.label).toUpperCase()) ?? s.priceUsd,
        }));
      }
      return next;
    });
  }, [price, saleType, spotsCustomized, boardPack, queueDraftNcaa, playerListText]);

  const handleSpotVariantsChange = useCallback((next: VariantDraftInput[]) => {
    setSpotVariants((prev) => {
      if (prev.length === next.length && next.some((spot, index) => spot.priceUsd !== prev[index]?.priceUsd)) {
        setSpotsCustomized(true);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose("escape", onRequestClose);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onRequestClose]);

  const uploadQueueThumbnail = useCallback(async (file: File) => {
    setImageError(null);
    if (!THUMBNAIL_UPLOAD_ALLOWED.has(file.type)) {
      setImageError("Use a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > THUMBNAIL_MAX_FILE_BYTES) {
      setImageError("Photo must be 20MB or smaller.");
      return;
    }

    setImageUploading(true);
    try {
      const blob = await compressImageFileToBlob(file, 1280, 0.86);
      const url = await uploadListingImageBlob(blob, "live-queue-thumbnail.jpg");
      setImageUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setImageError(msg || "Could not upload photo.");
    } finally {
      setImageUploading(false);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    setFormError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("Enter a product title.");
      return;
    }
    if (!imageUrl.trim()) {
      setImageError("Add one product photo.");
      return;
    }

    const qtyRaw = quantity.trim() === "" ? 1 : Number(quantity);
    const parsedQty = Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.min(512, Math.floor(qtyRaw)) : 1;
    const parsedPrice = parseUsd(price);

    if (!selectedProfileId.trim()) {
      setFormError("Select a shipping profile for this lot.");
      return;
    }
    const profilePayload = profileOptionsAreSeller
      ? { sellerShippingProfileId: selectedProfileId }
      : { shippingProfileId: selectedProfileId };

    if (saleType === "pyt" || saleType === "pyd") {
      if (saleType === "pyd" && !boardPackSupportsDivisions(boardPack)) {
        setFormError("Divisions are only available for NFL boards.");
        return;
      }
      if (parsedPrice == null) {
        setFormError(saleType === "pyt" ? "Enter a price per team." : "Enter a price per division.");
        return;
      }
      const expected =
        saleType === "pyt"
          ? teamBoardSpotCount(boardPack) + (boardPack === "nfl" && queueDraftNcaa ? 1 : 0)
          : 8;
      const teamsPreset = teamsPresetIdForBoardPack(boardPack);
      let variants =
        spotVariants.length === expected
          ? spotVariants
          : buildVariantsFromPreset(saleType === "pyt" ? teamsPreset : "nfl_divisions", parsedPrice, 1);
      if (saleType === "pyt" && boardPack === "nfl" && queueDraftNcaa) {
        variants = withNcaaBuyableSpot(stripNcaaSpotVariants(variants), parsedPrice);
      } else if (saleType === "pyt") {
        variants = stripNcaaSpotVariants(variants);
      }
      const ok = await onSubmitAuction({
        title: trimmedTitle,
        imageUrl: imageUrl.trim(),
        priceUsd: parsedPrice,
        startingBidUsd: 1,
        quantity: 1,
        salesFormat: saleType === "pyt" ? "variant_selection" : "team_break",
        variantAssignmentMode: "pick",
        variants,
        teamBoardMisc: queueDraftMisc,
        teamBoardNcaa: boardPack === "nfl" && queueDraftNcaa,
        ...profilePayload,
      });
      if (ok) requestClose("success", onRequestClose);
      return;
    }

    if (saleType === "random_pyt" || saleType === "random_pyd") {
      if (saleType === "random_pyd" && !boardPackSupportsDivisions(boardPack)) {
        setFormError("Divisions are only available for NFL boards.");
        return;
      }
      if (parsedPrice == null) {
        setFormError(saleType === "random_pyt" ? "Enter a price per team." : "Enter a price per division.");
        return;
      }
      const preset = saleType === "random_pyt" ? teamsPresetIdForBoardPack(boardPack) : "nfl_divisions";
      let variants = buildRandomVariantsFromPreset(preset, parsedPrice);
      if (saleType === "random_pyt" && boardPack === "nfl" && queueDraftNcaa) {
        variants = withNcaaRandomPoolSeat(variants, teamBoardSpotCount("nfl"));
      }
      const ok = await onSubmitAuction({
        title: trimmedTitle,
        imageUrl: imageUrl.trim(),
        priceUsd: parsedPrice,
        startingBidUsd: 1,
        quantity: 1,
        salesFormat: saleType === "random_pyt" ? "variant_selection" : "team_break",
        variantAssignmentMode: "random",
        variants,
        teamBoardMisc: queueDraftMisc,
        teamBoardNcaa: boardPack === "nfl" && queueDraftNcaa,
        ...profilePayload,
      });
      if (ok) requestClose("success", onRequestClose);
      return;
    }

    if (saleType === "pyp" || saleType === "random_pyp") {
      if (parsedPrice == null) {
        setFormError("Enter a price per player.");
        return;
      }
      const parsed = parsePlayerSpotList(playerListText);
      if (!parsed.ok) {
        setFormError(parsed.message);
        return;
      }
      if (saleType === "pyp") {
        const variants =
          spotVariants.length === parsed.names.length
            ? spotVariants
            : buildPlayerPickVariants(parsed.names, parsedPrice);
        const ok = await onSubmitAuction({
          title: trimmedTitle,
          imageUrl: imageUrl.trim(),
          priceUsd: parsedPrice,
          startingBidUsd: 1,
          quantity: 1,
          salesFormat: "player_selection",
          variantAssignmentMode: "pick",
          variants,
          teamBoardMisc: false,
          teamBoardNcaa: false,
          ...profilePayload,
        });
        if (ok) requestClose("success", onRequestClose);
        return;
      }
      const ok = await onSubmitAuction({
        title: trimmedTitle,
        imageUrl: imageUrl.trim(),
        priceUsd: parsedPrice,
        startingBidUsd: 1,
        quantity: 1,
        salesFormat: "player_selection",
        variantAssignmentMode: "random",
        variants: [buildRandomPlayerVariant(parsedPrice, parsed.names.length)],
        teamBoardMisc: false,
        teamBoardNcaa: false,
        customRandomPoolLabels: parsed.names,
        ...profilePayload,
      });
      if (ok) requestClose("success", onRequestClose);
      return;
    }

    if (saleType === "buy_now") {
      if (parsedPrice == null) {
        setFormError("Enter a buy-it-now price.");
        return;
      }
      const ok = await onSubmitAuction({
        title: trimmedTitle,
        imageUrl: imageUrl.trim(),
        priceUsd: parsedPrice,
        startingBidUsd: 1,
        quantity: parsedQty,
        salesFormat: "buy_now",
        variants: [],
        teamBoardMisc: queueDraftMisc,
        teamBoardNcaa: false,
        ...profilePayload,
      });
      if (ok) requestClose("success", onRequestClose);
      return;
    }

    const startingBidUsd = parsedPrice ?? 1;
    const ok = await onSubmitAuction({
      title: trimmedTitle,
      imageUrl: imageUrl.trim(),
      priceUsd: null,
      startingBidUsd,
      quantity: parsedQty,
      salesFormat: "auction",
      variants: [],
      teamBoardMisc: queueDraftMisc,
      teamBoardNcaa: false,
      ...profilePayload,
    });
    if (ok) requestClose("success", onRequestClose);
  }, [boardPack, imageUrl, onRequestClose, onSubmitAuction, playerListText, price, profileOptionsAreSeller, quantity, queueDraftMisc, queueDraftNcaa, saleType, selectedProfileId, spotVariants, title]);

  const handleSubmitGiveaway = useCallback(async () => {
    if (!onSubmitGiveaway || (mode !== "giveaway" && mode !== "buyers_giveaway")) return;
    setFormError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("Enter a giveaway title.");
      return;
    }
    const kind: LiveGiveawayKind = mode === "buyers_giveaway" ? "buyers" : "open";
    if (kind === "buyers" && rulesText.trim().length < 80) {
      setFormError("Buyers giveaways need official promotion rules (80+ characters).");
      return;
    }
    const ok = await onSubmitGiveaway({
      kind,
      title: trimmedTitle,
      prizeDescription: prizeDescription.trim(),
      imageUrl: imageUrl.trim(),
      rulesText: rulesText.trim(),
      openEntries: openEntriesOnCreate,
    });
    if (ok) requestClose("success", onRequestClose);
  }, [
    imageUrl,
    mode,
    onRequestClose,
    onSubmitGiveaway,
    openEntriesOnCreate,
    prizeDescription,
    rulesText,
    title,
  ]);

  const handleSubmitFromShop = useCallback(async () => {
    if (!onSubmitFromShop) return;
    setFormError(null);
    if (selectedShopIds.length === 0) {
      setFormError("Select at least one item from your shop.");
      return;
    }
    const ok = await onSubmitFromShop(selectedShopIds);
    if (ok) requestClose("success", onRequestClose);
  }, [onRequestClose, onSubmitFromShop, selectedShopIds]);

  const handleImportFromPrior = useCallback(async () => {
    if (!onImportFromPriorRoom) return;
    setFormError(null);
    if (!selectedPriorRoomId.trim()) {
      setFormError("Pick a previous show to copy from.");
      return;
    }
    const ok = await onImportFromPriorRoom(selectedPriorRoomId.trim());
    if (ok) requestClose("success", onRequestClose);
  }, [onImportFromPriorRoom, onRequestClose, selectedPriorRoomId]);

  if (!mounted || !open || !mode) return null;

  if (mode === "giveaway" || mode === "buyers_giveaway") {
    const buyers = mode === "buyers_giveaway";
    return createPortal(
      <div
        role="dialog"
        aria-modal
        aria-label={buyers ? "Create buyers giveaway" : "Create giveaway"}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"
      >
        <div className="flex max-h-[min(92dvh,calc(100vh-48px))] w-full max-w-[min(520px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100">
              {buyers ? "Buyers giveaway" : "Giveaway"}
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={() => requestClose("cancel", onRequestClose)}
              className="rounded-lg border border-white/12 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06]"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            <p className="mb-4 text-sm text-zinc-500">
              {buyers
                ? "Purchases enter buyers silently. AMOE link is generated inside official rules only."
                : "Everyone in the room can enter while entries are open."}
            </p>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. PSA slab givvy"
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100"
            />
            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Prize description
            </label>
            <input
              value={prizeDescription}
              onChange={(e) => setPrizeDescription(e.target.value)}
              placeholder="What the winner receives"
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100"
            />
            <span className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Prize photo (optional)
            </span>
            <div
              onClick={() => !imageUploading && imageFileRef.current?.click()}
              role="button"
              tabIndex={0}
              className={`mt-2 rounded-lg border border-dashed px-4 py-3 ${imageUploading ? "opacity-70" : "cursor-pointer border-white/15 hover:border-white/25"}`}
            >
              <input
                ref={imageFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadQueueThumbnail(f);
                }}
              />
              {imageUrl ? <p className="text-xs text-zinc-300">Photo added</p> : <p className="text-xs text-zinc-500">Add optional photo</p>}
            </div>
            {imageError ? <p className="mt-1 text-xs text-rose-300">{imageError}</p> : null}
            {buyers ? (
              <>
                <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Official promotion rules
                </label>
                <textarea
                  value={rulesText}
                  onChange={(e) => setRulesText(e.target.value)}
                  rows={6}
                  placeholder="Full legal rules. The no-purchase entry link will be embedded here for counsel review — not promoted on stage."
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100"
                />
              </>
            ) : null}
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={openEntriesOnCreate}
                onChange={(e) => setOpenEntriesOnCreate(e.target.checked)}
                className="rounded border-white/20 bg-[#0c0c10]"
              />
              Open entries immediately after creating
            </label>
            {formError ? <p className="mt-3 text-xs text-rose-300">{formError}</p> : null}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => requestClose("cancel", onRequestClose)}
                className="flex-1 rounded-lg border border-white/12 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || imageUploading}
                onClick={() => void handleSubmitGiveaway()}
                className="flex-1 rounded-lg bg-gold/25 py-2 text-sm font-bold text-gold-bright ring-1 ring-gold/35 hover:bg-gold/30 disabled:opacity-50"
              >
                Create giveaway
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const priceLabel =
    saleType === "auction"
      ? "Starting bid"
      : saleType === "pyt" || saleType === "random_pyt"
        ? "Price per team"
        : saleType === "pyd" || saleType === "random_pyd"
          ? "Price per division"
          : saleType === "pyp" || saleType === "random_pyp"
            ? "Price per player"
            : "Buy-it-now price";
  const isPlayerBreak = saleType === "pyp" || saleType === "random_pyp";
  const isBreakSale =
    saleType === "pyt" ||
    saleType === "pyd" ||
    saleType === "random_pyt" ||
    saleType === "random_pyd" ||
    isPlayerBreak;
  const isPickBreak = saleType === "pyt" || saleType === "pyd" || saleType === "pyp";
  const isRandomBreak = saleType === "random_pyt" || saleType === "random_pyd" || saleType === "random_pyp";
  const playerListPreview = parsePlayerSpotList(playerListText);
  const playerCountLabel = playerListPreview.ok
    ? `${playerListPreview.names.length} / ${PLAYER_SPOT_MAX}`
    : `${playerListPreview.names?.length ?? 0} / ${PLAYER_SPOT_MAX}`;

  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label="Add product to show"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose("backdrop", onRequestClose);
      }}
    >
      <div
        className="flex max-h-[min(92dvh,calc(100vh-48px))] w-full max-w-[min(520px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100">Add to show</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => requestClose("cancel", onRequestClose)}
            className="rounded-lg border border-white/12 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06]"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-5">
          <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-xl border border-white/10 bg-[#0c0c10] p-1">
            {(
              [
                { id: "new" as const, label: SELLER_CONSOLE.addSourceNew },
                { id: "shop" as const, label: SELLER_CONSOLE.addSourceShop },
                { id: "copy" as const, label: SELLER_CONSOLE.addSourceCopyShow },
              ] as const
            ).map((tab) => {
              const on = addSource === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setAddSource(tab.id);
                    setFormError(null);
                  }}
                  className={`rounded-lg px-2 py-2 text-[11px] font-bold uppercase tracking-wide transition ${
                    on ? "bg-gold/20 text-gold-bright ring-1 ring-gold/35" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {addSource === "shop" ? (
            <div>
              <p className="mb-3 text-sm text-zinc-500">{SELLER_CONSOLE.addSourceShopHint}</p>
              <input
                value={shopQuery}
                onChange={(e) => setShopQuery(e.target.value)}
                placeholder="Search your shop…"
                className="mb-3 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100"
              />
              {shopLoading ? <p className="text-sm text-zinc-500">Loading shop inventory…</p> : null}
              {shopError ? <p className="text-xs text-rose-300">{shopError}</p> : null}
              {!shopLoading && !shopError && shopListings.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No reusable shop items yet. Add inventory under Seller HQ → Live show, then pull them in here.
                </p>
              ) : null}
              <ul className="space-y-2">
                {shopListings
                  .filter((row) => {
                    const q = shopQuery.trim().toLowerCase();
                    if (!q) return true;
                    return row.title.toLowerCase().includes(q);
                  })
                  .map((row) => {
                    const selected = selectedShopIds.includes(row.id);
                    const disabled = !row.available && !selected;
                    const priceLabel =
                      row.buyingFormat === "auction"
                        ? `Start $${Math.round(row.startingBidUsd ?? row.priceUsd ?? 0)}`
                        : `$${Math.round(row.priceUsd ?? 0)}`;
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          disabled={disabled || busy}
                          onClick={() => {
                            setSelectedShopIds((prev) =>
                              prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id],
                            );
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                            selected
                              ? "border-gold/40 bg-gold/10"
                              : disabled
                                ? "border-white/5 bg-white/[0.02] opacity-50"
                                : "border-white/10 bg-[#0c0c10] hover:border-white/20"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={row.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-zinc-100">{row.title}</span>
                            <span className="mt-0.5 block text-[11px] text-zinc-500">
                              {row.inventoryChannel === "live_show" ? "Live show" : "Marketplace"} · {priceLabel}
                              {row.alreadyInQueue ? " · Already in lineup" : ""}
                              {row.inventoryHeld ? " · Held in checkout" : ""}
                            </span>
                          </span>
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] ${
                              selected ? "border-gold bg-gold text-black" : "border-white/20 text-transparent"
                            }`}
                          >
                            ✓
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
              {formError ? <p className="mt-3 text-xs text-rose-300">{formError}</p> : null}
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => requestClose("cancel", onRequestClose)}
                  className="flex-1 rounded-lg border border-white/12 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || selectedShopIds.length === 0 || !onSubmitFromShop}
                  onClick={() => void handleSubmitFromShop()}
                  className="flex-1 rounded-lg bg-gold/25 py-2 text-sm font-bold text-gold-bright ring-1 ring-gold/35 hover:bg-gold/30 disabled:opacity-50"
                >
                  Add {selectedShopIds.length || ""} to lineup
                </button>
              </div>
            </div>
          ) : addSource === "copy" ? (
            <div>
              <p className="mb-3 text-sm text-zinc-500">{SELLER_CONSOLE.addSourceCopyHint}</p>
              {priorLoading ? <p className="text-sm text-zinc-500">Loading prior shows…</p> : null}
              {priorError ? <p className="text-xs text-rose-300">{priorError}</p> : null}
              {!priorLoading && !priorError && priorRooms.length === 0 ? (
                <p className="text-sm text-zinc-500">No prior shows found to copy from.</p>
              ) : null}
              <ul className="space-y-2">
                {priorRooms.map((room) => {
                  const selected = selectedPriorRoomId === room.id;
                  return (
                    <li key={room.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setSelectedPriorRoomId(room.id)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition ${
                          selected
                            ? "border-gold/40 bg-gold/10"
                            : "border-white/10 bg-[#0c0c10] hover:border-white/20"
                        }`}
                      >
                        <span>
                          <span className="block text-sm font-semibold text-zinc-100">{room.title || "Untitled show"}</span>
                          <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-zinc-500">
                            {room.status}
                          </span>
                        </span>
                        <span
                          className={`h-3.5 w-3.5 rounded-full border ${
                            selected ? "border-gold bg-gold" : "border-white/25"
                          }`}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {formError ? <p className="mt-3 text-xs text-rose-300">{formError}</p> : null}
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => requestClose("cancel", onRequestClose)}
                  className="flex-1 rounded-lg border border-white/12 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !selectedPriorRoomId || !onImportFromPriorRoom}
                  onClick={() => void handleImportFromPrior()}
                  className="flex-1 rounded-lg bg-gold/25 py-2 text-sm font-bold text-gold-bright ring-1 ring-gold/35 hover:bg-gold/30 disabled:opacity-50"
                >
                  Copy unsold lineup
                </button>
              </div>
            </div>
          ) : (
            <>
          <p className="mb-4 text-sm text-zinc-500">Title, photo, price, and quantity — ready in seconds.</p>

          <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. PSA 10 rookie chase"
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100"
          />

          <span className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Photo</span>
          <div
            onClick={() => !imageUploading && imageFileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !imageUploading) {
                e.preventDefault();
                imageFileRef.current?.click();
              }
            }}
            className={`mt-2 rounded-lg border border-dashed px-4 py-4 transition ${
              imageUrl ? "border-white/10 bg-[#0c0c10]" : "cursor-pointer border-white/15 bg-[#0c0c10] hover:border-white/25"
            } ${imageUploading ? "pointer-events-none opacity-70" : ""}`}
          >
            <input
              ref={imageFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadQueueThumbnail(f);
              }}
            />
            {imageUrl.trim() ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- uploaded queue thumbnail */}
                <img src={imageUrl} alt="" className="size-20 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-200">Photo added</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">Shown on queue cards and pinned item.</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    imageFileRef.current?.click();
                  }}
                  className="rounded-lg border border-white/12 px-2 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-white/[0.06]"
                >
                  Replace
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-3 text-center">
                <p className="text-sm font-semibold text-zinc-200">Add photo</p>
                <p className="mt-1 text-[11px] text-zinc-500">1 photo required · JPG, PNG, or WebP</p>
              </div>
            )}
          </div>
          {imageError ? <p className="mt-1 text-xs text-rose-300">{imageError}</p> : null}

          <span className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Sale type</span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {SALE_CATEGORIES.map((type) => {
              const active = saleCategory === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => {
                    setSaleCategory(type.id);
                    if (type.id === "teams_divisions") {
                      setSpotVariants([]);
                      setSpotsCustomized(false);
                    }
                  }}
                  className={`rounded-lg border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-gold/45 bg-gold/15 text-gold-bright"
                      : "border-white/12 bg-[#0c0c10] text-zinc-400 hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="block text-sm font-bold">{type.label}</span>
                  <span className="mt-0.5 block text-[11px] font-medium opacity-80">{type.sub}</span>
                </button>
              );
            })}
          </div>

          {saleCategory === "teams_divisions" ? (
            <>
              {!isPlayerBreak ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {LIVE_BOARD_PACKS.map((pack) => {
                  const active = boardPack === pack.id;
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => {
                        setBoardPack(pack.id);
                        setSpotVariants([]);
                        setSpotsCustomized(false);
                        if (pack.id !== "nfl") setQueueDraftNcaa(false);
                        if (!boardPackSupportsDivisions(pack.id) && (breakSaleType === "pyd" || breakSaleType === "random_pyd")) {
                          setBreakSaleType("pyt");
                        }
                      }}
                      className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
                        active
                          ? "border-gold/45 bg-gold/15 text-gold-bright"
                          : "border-white/12 bg-[#0c0c10] text-zinc-400 hover:bg-white/[0.04]"
                      }`}
                    >
                      {pack.label}
                    </button>
                  );
                })}
              </div>
              ) : null}
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {visibleBreakVariants(boardPack).map((type) => {
                  const active = breakSaleType === type.id;
                  const teamCount = teamBoardSpotCount(boardPack);
                  const sub =
                    type.id === "random_pyt"
                      ? `${teamCount} · vault reveal`
                      : type.id === "pyt"
                        ? `${TEAM_BOARD_LEAGUE_LABELS[boardPack]} · ${teamCount} teams`
                        : type.id === "pyp"
                          ? "Paste your checklist"
                          : type.id === "random_pyp"
                            ? "Paste · vault reveal"
                            : type.sub;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => {
                        setBreakSaleType(type.id);
                        setSpotVariants([]);
                        setSpotsCustomized(false);
                        if (type.id !== "pyt" && type.id !== "random_pyt") setQueueDraftNcaa(false);
                      }}
                      className={`rounded-lg border px-3 py-2.5 text-left transition ${
                        active
                          ? "border-gold/45 bg-gold/15 text-gold-bright"
                          : "border-white/12 bg-[#0c0c10] text-zinc-400 hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="block text-sm font-bold">{type.label}</span>
                      <span className="mt-0.5 block text-[11px] font-medium opacity-80">{sub}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {isBreakSale ? (
            <p className="mt-3 rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-xs text-zinc-300">
              {isPlayerBreak
                ? isRandomBreak
                  ? "Buyers purchase a seat — Vault Reveal assigns a player from your list. Won names leave the pool."
                  : "One player per line. Buyers pick a name from your list. Sold spots disappear from the board."
                : isRandomBreak
                ? `Buyers purchase a spot — Vault Reveal assigns ${
                    saleType === "random_pyt"
                      ? `a ${TEAM_BOARD_LEAGUE_LABELS[boardPack]} team`
                      : "a division"
                  } from what's left. Won spots leave the pool.`
                : `Buyers pick from ${
                    saleType === "pyt" ? `${teamBoardSpotCount(boardPack)} teams` : "8 divisions"
                  }. Sold spots disappear from the board.`}
            </p>
          ) : null}

          {isPlayerBreak ? (
            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Player list
                </label>
                <span className="text-[10px] font-semibold text-zinc-500">{playerCountLabel}</span>
              </div>
              <textarea
                value={playerListText}
                onChange={(e) => {
                  setPlayerListText(e.target.value);
                  setSpotsCustomized(false);
                }}
                rows={6}
                placeholder={"Mahomes\nAllen\nHurts\n…"}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100"
                aria-label="Player list"
              />
              {!playerListPreview.ok && playerListText.trim() ? (
                <p className="mt-1 text-[11px] text-rose-300">{playerListPreview.message}</p>
              ) : null}
            </div>
          ) : null}

          <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{priceLabel}</label>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={saleType === "auction" ? "1" : isBreakSale ? "25" : "25"}
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100"
          />

          {isPickBreak && spotVariants.length > 0 ? (
            <div className="mt-4 min-w-0">
              <LiveItemVariantBuilder
                salesFormat={
                  saleType === "pyd"
                    ? "team_break"
                    : saleType === "pyp"
                      ? "player_selection"
                      : "variant_selection"
                }
                onSalesFormatChange={() => {}}
                defaultPriceUsd={price}
                variants={spotVariants}
                onVariantsChange={handleSpotVariantsChange}
              />
            </div>
          ) : null}

          <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Shipping profile
          </label>
          <select
            value={selectedProfileId}
            onChange={(e) => setSelectedProfileId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">Select a profile…</option>
            {profileOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-zinc-500">
            Controls parcel size and how this lot bundles with other wins in the show.
          </p>

          <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Quantity</label>
          <input
            inputMode="numeric"
            min={1}
            value={isBreakSale ? "1" : quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="1"
            disabled={isBreakSale}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100 disabled:opacity-45"
            aria-label="Quantity"
          />

          {teamBoardLeague === "nfl" || boardPack === "nfl" ? (
            !isPlayerBreak ? (
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={queueDraftMisc}
                onChange={(e) => setQueueDraftMisc(e.target.checked)}
                className="rounded border-white/20 bg-[#0c0c10]"
              />
              MISC spot (shows MISC on team board while this item is active)
            </label>
            ) : null
          ) : null}

          {boardPack === "nfl" && (saleType === "pyt" || saleType === "random_pyt") ? (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={queueDraftNcaa}
                onChange={(e) => setQueueDraftNcaa(e.target.checked)}
                className="rounded border-white/20 bg-[#0c0c10]"
              />
              Add NCAA spot (buyable · off by default)
            </label>
          ) : null}

          {formError ? <p className="mt-3 text-xs text-rose-300">{formError}</p> : null}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => requestClose("cancel", onRequestClose)}
              className="flex-1 rounded-lg border border-white/12 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || imageUploading}
              onClick={() => void handleSubmit()}
              className="flex-1 rounded-lg bg-gold/25 py-2 text-sm font-bold text-gold-bright ring-1 ring-gold/35 hover:bg-gold/30 disabled:opacity-50"
            >
              Save to show
            </button>
          </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
