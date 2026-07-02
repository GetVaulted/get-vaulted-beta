"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { compressImageFileToBlob } from "@/lib/listing-image-compress";
import { uploadListingImageBlob } from "@/lib/upload-listing-image-client";
import { buildRandomVariantsFromPreset, buildVariantsFromPreset, type VariantDraftInput } from "@/lib/live-item-variant-presets";
import { LiveItemVariantBuilder } from "@/components/live-auction/LiveItemVariantBuilder";
import { resolveLiveHostDefaultShippingProfileId } from "@/lib/live-show-category-shipping-profile";
import { SELLER_CONSOLE } from "@/lib/seller-console-copy";

export type AddQueueItemCloseReason = "cancel" | "success" | "escape";

export type AddQueueItemAuctionPayload = {
  title: string;
  imageUrl: string;
  priceUsd: number | null;
  startingBidUsd: number;
  quantity: number;
  salesFormat: "auction" | "buy_now" | "variant_selection" | "team_break";
  variantAssignmentMode?: "pick" | "random";
  variants: VariantDraftInput[];
  teamBoardMisc: boolean;
  sellerShippingProfileId?: string | null;
  shippingProfileId?: string | null;
};

import type { LiveGiveawayKind } from "@/lib/seller-queue-tabs";
import type { SellerQueueAddModalMode } from "@/lib/seller-queue-tabs";

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
};

const ALLOWED_CLOSE: AddQueueItemCloseReason[] = ["cancel", "success", "escape"];
const THUMBNAIL_UPLOAD_ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const THUMBNAIL_MAX_FILE_BYTES = 20 * 1024 * 1024;

type SaleCategory = "teams_divisions" | "auction" | "buy_now";
type BreakSaleType = "pyt" | "pyd" | "random_pyt" | "random_pyd";
type SaleType = "auction" | "buy_now" | BreakSaleType;

const SALE_CATEGORIES: { id: SaleCategory; label: string; sub: string }[] = [
  { id: "teams_divisions", label: SELLER_CONSOLE.saleCategoryTeamsDivisions, sub: "Pick or random spots" },
  { id: "auction", label: SELLER_CONSOLE.saleCategoryAuction, sub: "Timed bidding" },
  { id: "buy_now", label: SELLER_CONSOLE.saleCategoryBuyNow, sub: "Fixed price" },
];

const BREAK_VARIANTS: { id: BreakSaleType; label: string; sub: string }[] = [
  { id: "pyt", label: "PYT", sub: "Pick your team" },
  { id: "pyd", label: "PYD", sub: "Pick division" },
  { id: "random_pyt", label: "Random Teams", sub: "32 · vault reveal" },
  { id: "random_pyd", label: "Random Divisions", sub: "8 · vault reveal" },
];

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
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saleCategory, setSaleCategory] = useState<SaleCategory>("auction");
  const [breakSaleType, setBreakSaleType] = useState<BreakSaleType>("pyt");
  const saleType = saleTypeForCategory(saleCategory, breakSaleType);
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [queueDraftMisc, setQueueDraftMisc] = useState(false);
  const [rulesText, setRulesText] = useState("");
  const [prizeDescription, setPrizeDescription] = useState("");
  const [openEntriesOnCreate, setOpenEntriesOnCreate] = useState(true);
  const [profileOptions, setProfileOptions] = useState<{ id: string; name: string; isDefault?: boolean }[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileOptionsAreSeller, setProfileOptionsAreSeller] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [spotVariants, setSpotVariants] = useState<VariantDraftInput[]>([]);
  const [spotsCustomized, setSpotsCustomized] = useState(false);
  const wasOpenRef = useRef(false);
  const imageFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setTitle("");
      setImageUrl("");
      setImageUploading(false);
      setImageError(null);
      setSaleCategory(mode === "bin" ? "buy_now" : "auction");
      setBreakSaleType("pyt");
      setPrice("");
      setQuantity("1");
      setQueueDraftMisc(false);
      setRulesText("");
      setPrizeDescription("");
      setOpenEntriesOnCreate(true);
      setFormError(null);
      setSelectedProfileId("");
      setSpotVariants([]);
      setSpotsCustomized(false);
    }
    wasOpenRef.current = open;
  }, [mode, open]);

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
    if (saleType !== "pyt" && saleType !== "pyd") {
      setSpotVariants([]);
      return;
    }
    const base = parseUsd(price);
    const expected = saleType === "pyt" ? 32 : 8;
    setSpotVariants((prev) => {
      if (base == null) return prev.length === expected ? prev : [];
      if (prev.length !== expected) {
        return buildVariantsFromPreset(saleType === "pyt" ? "nfl_teams" : "nfl_divisions", base, 1);
      }
      if (spotsCustomized) return prev;
      return prev.map((spot) => ({ ...spot, priceUsd: base }));
    });
  }, [price, saleType, spotsCustomized]);

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
      if (parsedPrice == null) {
        setFormError(saleType === "pyt" ? "Enter a price per team." : "Enter a price per division.");
        return;
      }
      const variants =
        spotVariants.length === (saleType === "pyt" ? 32 : 8)
          ? spotVariants
          : buildVariantsFromPreset(saleType === "pyt" ? "nfl_teams" : "nfl_divisions", parsedPrice, 1);
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
        ...profilePayload,
      });
      if (ok) requestClose("success", onRequestClose);
      return;
    }

    if (saleType === "random_pyt" || saleType === "random_pyd") {
      if (parsedPrice == null) {
        setFormError(saleType === "random_pyt" ? "Enter a price per team." : "Enter a price per division.");
        return;
      }
      const preset = saleType === "random_pyt" ? "nfl_teams" : "nfl_divisions";
      const ok = await onSubmitAuction({
        title: trimmedTitle,
        imageUrl: imageUrl.trim(),
        priceUsd: parsedPrice,
        startingBidUsd: 1,
        quantity: 1,
        salesFormat: saleType === "random_pyt" ? "variant_selection" : "team_break",
        variantAssignmentMode: "random",
        variants: buildRandomVariantsFromPreset(preset, parsedPrice),
        teamBoardMisc: queueDraftMisc,
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
      ...profilePayload,
    });
    if (ok) requestClose("success", onRequestClose);
  }, [imageUrl, onRequestClose, onSubmitAuction, price, profileOptionsAreSeller, quantity, queueDraftMisc, saleType, selectedProfileId, spotVariants, title]);

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
      : saleType === "pyt"
        ? "Price per team"
        : saleType === "pyd"
          ? "Price per division"
          : "Buy-it-now price";
  const isBreakSale =
    saleType === "pyt" || saleType === "pyd" || saleType === "random_pyt" || saleType === "random_pyd";
  const isPickBreak = saleType === "pyt" || saleType === "pyd";
  const isRandomBreak = saleType === "random_pyt" || saleType === "random_pyd";

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
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BREAK_VARIANTS.map((type) => {
                const active = breakSaleType === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => {
                      setBreakSaleType(type.id);
                      setSpotVariants([]);
                      setSpotsCustomized(false);
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
          ) : null}

          {isBreakSale ? (
            <p className="mt-3 rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-xs text-zinc-300">
              {isRandomBreak
                ? `Buyers purchase a spot — Vault Reveal assigns ${saleType === "random_pyt" ? "an NFL team" : "a division"} from what's left. Won spots leave the pool.`
                : `Buyers pick from ${saleType === "pyt" ? "32 teams" : "8 divisions"}. Sold spots disappear from the board.`}
            </p>
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
                salesFormat={saleType === "pyt" ? "variant_selection" : "team_break"}
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

          {teamBoardLeague === "nfl" ? (
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={queueDraftMisc}
                onChange={(e) => setQueueDraftMisc(e.target.checked)}
                className="rounded border-white/20 bg-[#0c0c10]"
              />
              MISC spot (shows MISC on team board while this item is active)
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
        </div>
      </div>
    </div>,
    document.body,
  );
}
