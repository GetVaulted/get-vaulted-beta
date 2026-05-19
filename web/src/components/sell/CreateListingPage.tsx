"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarketplaceBrowseCard } from "@/components/marketplace/MarketplaceBrowseCard";
import type { MarketplaceBuyingFormat, MarketplaceCategory, MarketplaceListing } from "@/content/marketplace-listings";
import {
  getAddAnotherPreservedValues,
  getFieldsHiddenInQuickListMode,
  getPresetFields,
  getQuickListDefaults,
  isAdvancedShippingVisible,
  isCreateActionDisabled,
  isSaveDraftDisabled,
  type ShippingPreset,
} from "@/lib/create-listing-form";
import { hasCompleteParcel } from "@/lib/listing-publish";
import { LISTING_WORKSPACE_KEY } from "@/lib/listing-workspace";
import { compressImageFileToBlob } from "@/lib/listing-image-compress";
import type { SellerListingStatus, StoredUserListing } from "@/lib/user-listings-storage";

const CATEGORY_OPTIONS: MarketplaceCategory[] = [
  "Trading Cards",
  "Memorabilia",
  "Watches",
  "Sneakers",
  "Other",
];

const CONDITION_OPTIONS = ["Raw", "PSA 10", "PSA 9", "BGS 9.5", "DS", "Used", "Other"] as const;

const AUCTION_DURATIONS = [
  { value: 1, label: "1 day" },
  { value: 3, label: "3 days" },
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
] as const;

const DRAFT_KEY = "gv_create_listing_draft";

const UPLOAD_ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BEFORE_COMPRESS = 20 * 1024 * 1024;

async function uploadListingImageBlob(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.set("file", blob, "photo.jpg");
  const res = await fetch("/api/uploads/listing-image", { method: "POST", body: fd });
  const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || typeof j.url !== "string") {
    throw new Error(typeof j.error === "string" ? j.error : "Upload failed");
  }
  return j.url;
}

type FieldErrors = Partial<{
  images: string;
  title: string;
  category: string;
  condition: string;
  price: string;
  startingBid: string;
  minimumOffer: string;
  parcel: string;
  shippingProfile: string;
  sellerReadiness: string;
  stripe: string;
}>;

type DraftPayload = {
  title: string;
  category: MarketplaceCategory | "";
  condition: string;
  buyingFormat: MarketplaceBuyingFormat;
  price: string;
  startingBid: string;
  reservePrice: string;
  auctionDurationDays: number;
  description: string;
  shippingPrice: string;
  handlingTime: string;
  signatureRequired: boolean;
  allowOffers: boolean;
  acceptTradeOffers: boolean;
  minimumOfferUsd: string;
  parcelWeightOz: string;
  parcelLengthIn: string;
  parcelWidthIn: string;
  parcelHeightIn: string;
  shippingCategory: string;
  shippingBaseWeightOz: string;
  shippingIncrementalWeightOz: string;
  shippingPreset: ShippingPreset;
  shipFromAddressId?: string | null;
};

type AddressOption = {
  id: string;
  type?: string;
  name: string;
  fullName: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

function parseMoney(raw: string): number | null {
  const n = Number(String(raw).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseNonNegativeMoney(raw: string): number | null {
  const n = Number(String(raw).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parsePositiveDim(raw: string): number | null {
  const n = Number(String(raw).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function notifyListingsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("gv-listings-updated"));
}

export function CreateListingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const editIdParam = searchParams.get("edit");
  const duplicateIdParam = searchParams.get("duplicate");

  const { data: session, status } = useSession();
  const [workspaceListingId, setWorkspaceListingId] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [activeImage, setActiveImage] = useState(0);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<MarketplaceCategory | "">("");
  const [condition, setCondition] = useState<string>("");
  const [buyingFormat, setBuyingFormat] = useState<MarketplaceBuyingFormat>("buy_now");
  const [price, setPrice] = useState("");
  const [startingBid, setStartingBid] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [auctionDurationDays, setAuctionDurationDays] = useState<number>(7);
  const [description, setDescription] = useState("");
  const [shippingPrice, setShippingPrice] = useState("");
  const [handlingTime, setHandlingTime] = useState("1–2 business days");
  const [signatureRequired, setSignatureRequired] = useState(false);
  const [allowOffers, setAllowOffers] = useState(false);
  const [acceptTradeOffers, setAcceptTradeOffers] = useState(false);
  const [minimumOfferUsd, setMinimumOfferUsd] = useState("");
  const [parcelWeightOz, setParcelWeightOz] = useState("");
  const [parcelLengthIn, setParcelLengthIn] = useState("");
  const [parcelWidthIn, setParcelWidthIn] = useState("");
  const [parcelHeightIn, setParcelHeightIn] = useState("");
  const [shippingPreset, setShippingPreset] = useState<ShippingPreset>("raw_card");
  const [shippingCategory, setShippingCategory] = useState("raw_card");
  const [shippingBaseWeightOz, setShippingBaseWeightOz] = useState("4");
  const [shippingIncrementalWeightOz, setShippingIncrementalWeightOz] = useState("1");
  const [shipFromAddresses, setShipFromAddresses] = useState<AddressOption[]>([]);
  const [shipFromAddressId, setShipFromAddressId] = useState("");
  const [shipFromSelectorOpen, setShipFromSelectorOpen] = useState(false);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimateGroups, setEstimateGroups] = useState<
    Array<{ carrier: string; service: string; minCents: number; maxCents: number; sampleCount: number; currency: string }>
  >([]);
  const estimateSigRef = useRef<string>("");

  const [readinessLoading, setReadinessLoading] = useState(true);
  const [sellerCanPublish, setSellerCanPublish] = useState(true);
  const [sellerReadinessIssues, setSellerReadinessIssues] = useState<string[]>([]);
  const [quickListMode, setQuickListMode] = useState(false);
  const [shippingAdvancedOpen, setShippingAdvancedOpen] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [success, setSuccess] = useState<{ id: string; href: string } | null>(null);
  const [editingListingId, setEditingListingId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [reorderDragIndex, setReorderDragIndex] = useState<number | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      const path = pathname || "/sell/create";
      router.replace(`/signin?returnTo=${encodeURIComponent(path)}`);
    }
  }, [status, pathname, router]);

  const applyStoredToForm = useCallback((l: StoredUserListing) => {
    setTitle(l.title);
    setCategory(l.category);
    setCondition(l.condition);
    setBuyingFormat(l.buyingFormat);
    setPrice(l.buyingFormat === "buy_now" ? String(l.price) : "");
    setStartingBid(l.buyingFormat === "auction" ? String(l.startingBid ?? l.price) : "");
    setReservePrice(l.reservePrice != null ? String(l.reservePrice) : "");
    setAuctionDurationDays(l.auctionDurationDays ?? 7);
    setDescription(l.description);
    setShippingPrice(String(l.shippingPriceUsd));
    setHandlingTime(l.handlingTime);
    setSignatureRequired(l.signatureRequired);
    setAllowOffers(l.allowOffers === true);
    setAcceptTradeOffers(l.acceptTradeOffers === true);
    setMinimumOfferUsd(l.minimumOfferUsd != null && Number.isFinite(l.minimumOfferUsd) ? String(l.minimumOfferUsd) : "");
    setParcelWeightOz(l.parcelWeightOz != null && Number.isFinite(l.parcelWeightOz) ? String(l.parcelWeightOz) : "");
    setParcelLengthIn(l.parcelLengthIn != null && Number.isFinite(l.parcelLengthIn) ? String(l.parcelLengthIn) : "");
    setParcelWidthIn(l.parcelWidthIn != null && Number.isFinite(l.parcelWidthIn) ? String(l.parcelWidthIn) : "");
    setParcelHeightIn(l.parcelHeightIn != null && Number.isFinite(l.parcelHeightIn) ? String(l.parcelHeightIn) : "");
    setShippingCategory(typeof l.shippingCategory === "string" ? l.shippingCategory : "raw_card");
    setShippingBaseWeightOz(
      l.shippingBaseWeightOz != null && Number.isFinite(l.shippingBaseWeightOz) ? String(l.shippingBaseWeightOz) : "4",
    );
    setShippingIncrementalWeightOz(
      l.shippingIncrementalWeightOz != null && Number.isFinite(l.shippingIncrementalWeightOz)
        ? String(l.shippingIncrementalWeightOz)
        : "1",
    );
    const preset = (typeof l.shippingCategory === "string" ? l.shippingCategory : "raw_card") as ShippingPreset;
    setShippingPreset(preset === "raw_card" || preset === "slab" || preset === "small_collectible" ? preset : "custom");
    setShipFromAddressId(typeof l.shipFromAddressId === "string" ? l.shipFromAddressId : "");
    setImages([...l.imageDataUrls]);
    setActiveImage(0);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/account/addresses", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as { addresses?: AddressOption[] };
      const rows = Array.isArray(j.addresses) ? j.addresses.filter((a) => (a as { type?: string }).type === "ship_from") : [];
      if (cancelled) return;
      setShipFromAddresses(rows);
      if (!shipFromAddressId) {
        const preferred = rows.find((r) => r.isDefault) ?? rows[0];
        if (preferred) setShipFromAddressId(preferred.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shipFromAddressId, status]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;
    if (!editIdParam && !duplicateIdParam) return;

    let cancelled = false;
    (async () => {
      const id = editIdParam ?? duplicateIdParam;
      if (!id) return;
      const res = await fetch(`/api/listings/${encodeURIComponent(id)}`);
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as { stored: StoredUserListing | null };
      const l = j.stored;
      if (!l || l.sellerId !== session.user.id || cancelled) return;
      if (editIdParam) {
        applyStoredToForm(l);
        setEditingListingId(l.id);
        setWorkspaceListingId(null);
        return;
      }
      applyStoredToForm(l);
      setEditingListingId(null);
      setTitle(`${l.title} (copy)`);
      setWorkspaceListingId(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [applyStoredToForm, duplicateIdParam, editIdParam, session?.user?.id, status]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;
    if (editIdParam || duplicateIdParam) return;

    let cancelled = false;
    (async () => {
      const res = await fetch("/api/listings?scope=workspace");
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as { listing: StoredUserListing | null };
      if (cancelled || !j.listing) return;
      applyStoredToForm(j.listing);
      setWorkspaceListingId(j.listing.id);
      setEditingListingId(j.listing.id);
    })();

    return () => {
      cancelled = true;
    };
  }, [applyStoredToForm, duplicateIdParam, editIdParam, session?.user?.id, status]);

  useEffect(() => {
    if (status === "authenticated") return;
    const frame = requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const d = JSON.parse(raw) as DraftPayload;
        if (d.title != null) setTitle(d.title);
        if (d.category) setCategory(d.category);
        if (d.condition) setCondition(d.condition);
        if (d.buyingFormat) setBuyingFormat(d.buyingFormat);
        if (d.price != null) setPrice(d.price);
        if (d.startingBid != null) setStartingBid(d.startingBid);
        if (d.reservePrice != null) setReservePrice(d.reservePrice);
        if (d.auctionDurationDays) setAuctionDurationDays(d.auctionDurationDays);
        if (d.description != null) setDescription(d.description);
        if (d.shippingPrice != null) setShippingPrice(d.shippingPrice);
        if (d.handlingTime != null) setHandlingTime(d.handlingTime);
        if (typeof d.signatureRequired === "boolean") setSignatureRequired(d.signatureRequired);
        if (typeof d.allowOffers === "boolean") setAllowOffers(d.allowOffers);
        if (typeof (d as DraftPayload).acceptTradeOffers === "boolean") setAcceptTradeOffers((d as DraftPayload).acceptTradeOffers);
        if (d.minimumOfferUsd != null) setMinimumOfferUsd(d.minimumOfferUsd);
        if (typeof (d as DraftPayload).parcelWeightOz === "string") setParcelWeightOz((d as DraftPayload).parcelWeightOz);
        if (typeof (d as DraftPayload).parcelLengthIn === "string") setParcelLengthIn((d as DraftPayload).parcelLengthIn);
        if (typeof (d as DraftPayload).parcelWidthIn === "string") setParcelWidthIn((d as DraftPayload).parcelWidthIn);
        if (typeof (d as DraftPayload).parcelHeightIn === "string") setParcelHeightIn((d as DraftPayload).parcelHeightIn);
        if (typeof (d as DraftPayload).shippingCategory === "string") setShippingCategory((d as DraftPayload).shippingCategory);
        if (typeof (d as DraftPayload).shippingBaseWeightOz === "string")
          setShippingBaseWeightOz((d as DraftPayload).shippingBaseWeightOz);
        if (typeof (d as DraftPayload).shippingIncrementalWeightOz === "string")
          setShippingIncrementalWeightOz((d as DraftPayload).shippingIncrementalWeightOz);
        if (
          (d as DraftPayload).shippingPreset === "raw_card" ||
          (d as DraftPayload).shippingPreset === "slab" ||
          (d as DraftPayload).shippingPreset === "small_collectible" ||
          (d as DraftPayload).shippingPreset === "custom"
        ) {
          setShippingPreset((d as DraftPayload).shippingPreset);
        }
        if (typeof (d as DraftPayload).shipFromAddressId === "string") {
          setShipFromAddressId((d as DraftPayload).shipFromAddressId ?? "");
        }
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      setReadinessLoading(true);
      try {
        const res = await fetch("/api/seller/publish-readiness", { cache: "no-store" });
        if (!res.ok || cancelled) {
          setSellerCanPublish(true);
          setSellerReadinessIssues([]);
          return;
        }
        const j = (await res.json()) as { canPublish?: boolean; issues?: unknown };
        if (cancelled) return;
        const issues = Array.isArray(j.issues) ? j.issues.filter((x): x is string => typeof x === "string") : [];
        setSellerCanPublish(j.canPublish !== false);
        setSellerReadinessIssues(issues);
      } finally {
        if (!cancelled) setReadinessLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const applyShippingPreset = useCallback((preset: ShippingPreset) => {
    setShippingPreset(preset);
    const next = getPresetFields(preset);
    if (!next) return;
    setShippingCategory(next.shippingCategory);
    setShippingBaseWeightOz(next.shippingBaseWeightOz);
    setShippingIncrementalWeightOz(next.shippingIncrementalWeightOz);
    setParcelWeightOz(next.parcelWeightOz);
    setParcelLengthIn(next.parcelLengthIn);
    setParcelWidthIn(next.parcelWidthIn);
    setParcelHeightIn(next.parcelHeightIn);
    setErrors((prev) => ({ ...prev, shippingProfile: undefined, parcel: undefined }));
  }, []);

  useEffect(() => {
    if (!quickListMode) return;
    const defaults = getQuickListDefaults({
      category,
      condition,
      format: buyingFormat,
      shippingPreset,
    });
    if (!category) setCategory(defaults.category as MarketplaceCategory);
    if (!condition) setCondition(defaults.condition);
    setHandlingTime(defaults.handlingTime);
    setBuyingFormat(defaults.format);
    applyShippingPreset(defaults.shippingPreset);
    setShippingAdvancedOpen(false);
  }, [applyShippingPreset, buyingFormat, category, condition, quickListMode, shippingPreset]);

  const resetFormForNextListing = useCallback(
    (preserve: {
      category: MarketplaceCategory | "";
      condition: string;
      format: MarketplaceBuyingFormat;
      preset: ShippingPreset;
    }) => {
      setImages([]);
      setActiveImage(0);
      setTitle("");
      setCategory(preserve.category);
      setCondition(preserve.condition);
      setBuyingFormat(preserve.format);
      setPrice("");
      setStartingBid("");
      setReservePrice("");
      setAuctionDurationDays(7);
      setDescription("");
      setShippingPrice("");
      setHandlingTime("1–2 business days");
      setSignatureRequired(false);
      setAllowOffers(false);
      setAcceptTradeOffers(false);
      setMinimumOfferUsd("");
      setParcelWeightOz("");
      setParcelLengthIn("");
      setParcelWidthIn("");
      setParcelHeightIn("");
      setErrors({});
      setSuccess(null);
      setEditingListingId(null);
      setWorkspaceListingId(null);
      applyShippingPreset(preserve.preset);
    },
    [applyShippingPreset],
  );

  const persistDraft = useCallback(() => {
    const draft: DraftPayload = {
      title,
      category,
      condition,
      buyingFormat,
      price,
      startingBid,
      reservePrice,
      auctionDurationDays,
      description,
      shippingPrice,
      handlingTime,
      signatureRequired,
      allowOffers,
      acceptTradeOffers,
      minimumOfferUsd,
      parcelWeightOz,
      parcelLengthIn,
      parcelWidthIn,
      parcelHeightIn,
      shippingCategory,
      shippingBaseWeightOz,
      shippingIncrementalWeightOz,
      shippingPreset,
      shipFromAddressId,
    };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [
    allowOffers,
    acceptTradeOffers,
    minimumOfferUsd,
    parcelWeightOz,
    parcelLengthIn,
    parcelWidthIn,
    parcelHeightIn,
    shippingBaseWeightOz,
    shippingCategory,
    shippingIncrementalWeightOz,
    shippingPreset,
    shipFromAddressId,
    auctionDurationDays,
    buyingFormat,
    category,
    condition,
    description,
    handlingTime,
    price,
    reservePrice,
    shippingPrice,
    signatureRequired,
    startingBid,
    title,
  ]);

  const handleSaveDraft = async () => {
    if (!session?.user) return;
    if (draftSaving) return;
    setErrors((e) => ({ ...e, minimumOffer: undefined, images: undefined }));
    persistDraft();
    const buy = parseMoney(price) ?? 1;
    const start = parseMoney(startingBid);
    let minOffer: number | null = null;
    if (allowOffers && minimumOfferUsd.trim() !== "") {
      const p = parseNonNegativeMoney(minimumOfferUsd);
      if (p == null) {
        setErrors((e) => ({
          ...e,
          minimumOffer: "Enter a valid minimum amount, or leave blank for no minimum.",
        }));
        return;
      }
      minOffer = p;
    }
    const draftPayload = {
      status: "draft" as const,
      title: title.trim() || "Untitled draft",
      category: (category || "Other") as MarketplaceCategory,
      condition: condition.trim() || "Other",
      buyingFormat,
      priceUsd: buyingFormat === "buy_now" ? buy : start ?? buy,
      startingBidUsd: buyingFormat === "auction" ? start ?? buy : null,
      currentBidUsd: buyingFormat === "auction" ? start ?? buy : null,
      reservePriceUsd: buyingFormat === "auction" ? (reservePrice.trim() === "" ? null : parseMoney(reservePrice)) : null,
      auctionDurationDays: buyingFormat === "auction" ? auctionDurationDays : null,
      description: description.trim(),
      shippingPriceUsd: parseNonNegativeMoney(shippingPrice) ?? 0,
      handlingTime: handlingTime.trim() || "—",
      signatureRequired,
      allowOffers,
      acceptTradeOffers,
      minimumOfferUsd: allowOffers ? minOffer : null,
      images,
      parcelWeightOz: parsePositiveDim(parcelWeightOz),
      parcelLengthIn: parsePositiveDim(parcelLengthIn),
      parcelWidthIn: parsePositiveDim(parcelWidthIn),
      parcelHeightIn: parsePositiveDim(parcelHeightIn),
      shippingCategory: shippingCategory.trim() || "custom",
      shippingBaseWeightOz: parsePositiveDim(shippingBaseWeightOz) ?? 1,
      shippingIncrementalWeightOz: parseNonNegativeMoney(shippingIncrementalWeightOz) ?? 0,
      shipFromAddressId: shipFromAddressId || null,
    };
    const hadEditingId = Boolean(editingListingId);
    setDraftSaving(true);
    try {
      const res = hadEditingId
        ? await fetch(`/api/listings/${encodeURIComponent(editingListingId!)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draftPayload),
          })
        : await fetch("/api/listings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...draftPayload,
              workspaceKey: LISTING_WORKSPACE_KEY,
            }),
          });
      if (!res.ok) {
        const errJ = (await res.json().catch(() => ({}))) as { error?: string };
        setErrors((e) => ({ ...e, images: errJ.error ?? "Could not save draft. Try again." }));
        return;
      }
      const j = (await res.json()) as { listing: StoredUserListing };
      if (!hadEditingId) setWorkspaceListingId(j.listing.id);
      setEditingListingId(j.listing.id);
      notifyListingsUpdated();
      router.refresh();
    } finally {
      setDraftSaving(false);
    }
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => UPLOAD_ALLOWED.has(f.type));
    if (list.length === 0) {
      setErrors((e) => ({ ...e, images: "Use JPG, PNG, or WebP images (8MB max each)." }));
      return;
    }
    setSubmitting(true);
    try {
      const urls: string[] = [];
      for (const file of list.slice(0, 12)) {
        if (file.size > MAX_FILE_BEFORE_COMPRESS) {
          setErrors((e) => ({ ...e, images: "One or more files are too large (20MB max before processing)." }));
          continue;
        }
        const blob = await compressImageFileToBlob(file);
        const url = await uploadListingImageBlob(blob);
        urls.push(url);
      }
      if (urls.length === 0) {
        setErrors((e) => ({
          ...e,
          images: e.images ?? "Could not upload images. Check type (JPG, PNG, WebP) and size.",
        }));
        return;
      }
      setImages((prev) => [...prev, ...urls].slice(0, 12));
      setErrors((e) => ({ ...e, images: undefined }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setErrors((e) => ({
        ...e,
        images: msg || "Could not upload one or more images. Try JPG, PNG, or WebP under 8MB.",
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setActiveImage((a) => {
      if (a === index) return 0;
      if (a > index) return a - 1;
      return a;
    });
  };

  const reorderThumbnails = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setImages((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setActiveImage((a) => {
      if (a === from) return to;
      if (from < to && a > from && a <= to) return a - 1;
      if (from > to && a >= to && a < from) return a + 1;
      return a;
    });
  };

  const previewListing: MarketplaceListing | null = useMemo(() => {
    if (!session?.user) return null;
    const displayTitle = title.trim() || "Your listing title";
    const displayCondition = condition.trim() || "Condition";
    const displayCategory = (category || "Trading Cards") as MarketplaceCategory;
    const id = "preview";
    const buyNow = parseMoney(price);
    const start = parseMoney(startingBid);
    const displayPrice =
      buyingFormat === "buy_now" ? Math.max(1, buyNow ?? 1) : Math.max(1, start ?? 99);
    const auctionTimeLeft =
      buyingFormat === "auction" ? `${auctionDurationDays}d left` : undefined;
    return {
      id,
      title: displayTitle,
      price: displayPrice,
      imageSeed: `preview-${session.user.id}`,
      imageUrls: images.length > 0 ? images : undefined,
      sellerUsername: session.user.username,
      /** Credentials sign-in requires a verified email. */
      sellerVerified: true,
      category: displayCategory,
      buyingFormat,
      auctionTimeLeft,
      condition: displayCondition,
      listedAt: new Date().toISOString(),
      href: "/marketplace",
      auctionDurationDays: buyingFormat === "auction" ? auctionDurationDays : undefined,
      allowOffers: allowOffers ? true : undefined,
      acceptTradeOffers: acceptTradeOffers ? true : undefined,
      minimumOfferUsd: allowOffers && minimumOfferUsd.trim() ? parseNonNegativeMoney(minimumOfferUsd) ?? undefined : undefined,
    };
  }, [
    allowOffers,
    acceptTradeOffers,
    minimumOfferUsd,
    auctionDurationDays,
    buyingFormat,
    category,
    condition,
    images,
    price,
    session,
    startingBid,
    title,
  ]);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (images.length === 0) next.images = "Add at least one photo.";
    if (!title.trim()) next.title = "Enter a title.";
    if (!category) next.category = "Choose a category.";
    if (!condition.trim()) next.condition = "Choose or enter condition.";
    if (buyingFormat === "buy_now") {
      if (parseMoney(price) == null) next.price = "Enter a valid buy now price.";
    } else if (parseMoney(startingBid) == null) {
      next.startingBid = "Enter a valid starting bid.";
    }
    if (allowOffers && minimumOfferUsd.trim() !== "") {
      if (parseNonNegativeMoney(minimumOfferUsd) == null) {
        next.minimumOffer = "Enter a valid minimum offer, or leave blank for no minimum.";
      }
    }
    const pRow = {
      parcelWeightOz: parsePositiveDim(parcelWeightOz),
      parcelLengthIn: parsePositiveDim(parcelLengthIn),
      parcelWidthIn: parsePositiveDim(parcelWidthIn),
      parcelHeightIn: parsePositiveDim(parcelHeightIn),
    };
    if (!hasCompleteParcel(pRow)) {
      next.parcel = "Enter parcel weight (oz) and length, width, and height (in), all greater than zero — required to publish.";
    }
    const base = parsePositiveDim(shippingBaseWeightOz);
    const incremental = parseNonNegativeMoney(shippingIncrementalWeightOz);
    if (!shippingCategory.trim() || base == null || incremental == null) {
      next.shippingProfile = "Set shipping preset/profile with category, base weight, and incremental weight.";
    }
    if (!sellerCanPublish) {
      next.sellerReadiness = "Finish seller setup before publishing.";
    }
    return next;
  };

  const handleCreate = async (opts?: { addAnother?: boolean }) => {
    if (!session?.user) return;
    setErrors((e) => ({ ...e, stripe: undefined, parcel: undefined, sellerReadiness: undefined, shippingProfile: undefined }));
    const v = validate();
    setErrors(v);
    if (Object.values(v).some(Boolean)) return;

    const isWorkspaceDraft = workspaceListingId != null && editingListingId === workspaceListingId;
    const buy = parseMoney(price)!;
    const start = parseMoney(startingBid);
    const reserveParsed = reservePrice.trim() === "" ? null : parseMoney(reservePrice);
    const ship = parseNonNegativeMoney(shippingPrice) ?? 0;
    const status: SellerListingStatus = buyingFormat === "auction" ? "auction_live" : "active";
    let minOfferPublish: number | null = null;
    if (allowOffers && minimumOfferUsd.trim() !== "") {
      minOfferPublish = parseNonNegativeMoney(minimumOfferUsd);
    }

    const pw = parsePositiveDim(parcelWeightOz)!;
    const pl = parsePositiveDim(parcelLengthIn)!;
    const pwi = parsePositiveDim(parcelWidthIn)!;
    const ph = parsePositiveDim(parcelHeightIn)!;
    const shippingBase = parsePositiveDim(shippingBaseWeightOz)!;
    const shippingIncremental = parseNonNegativeMoney(shippingIncrementalWeightOz)!;

    const payload = {
      title: title.trim(),
      category,
      condition,
      buyingFormat,
      description: description.trim(),
      shippingPriceUsd: ship,
      handlingTime: handlingTime.trim() || "Ships soon",
      signatureRequired,
      allowOffers,
      acceptTradeOffers,
      minimumOfferUsd: allowOffers ? minOfferPublish : null,
      status,
      images,
      priceUsd: buyingFormat === "buy_now" ? buy : start ?? buy,
      startingBidUsd: buyingFormat === "auction" ? start : null,
      currentBidUsd: buyingFormat === "auction" ? start : null,
      reservePriceUsd: buyingFormat === "auction" ? reserveParsed : null,
      auctionDurationDays: buyingFormat === "auction" ? auctionDurationDays : null,
      parcelWeightOz: pw,
      parcelLengthIn: pl,
      parcelWidthIn: pwi,
      parcelHeightIn: ph,
      shippingCategory: shippingCategory.trim() || "custom",
      shippingBaseWeightOz: shippingBase,
      shippingIncrementalWeightOz: shippingIncremental,
      shipFromAddressId: shipFromAddressId || null,
    };

    setSubmitting(true);
    try {
      let publishedId = "";

      const applyPublishError = async (res: Response) => {
        const errJ = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        const msg = typeof errJ.error === "string" ? errJ.error : "Could not save listing. Try again.";
        if (errJ.code === "PARCEL_REQUIRED") {
          setErrors((e) => ({ ...e, parcel: msg, stripe: undefined }));
        } else if (errJ.code === "STRIPE_ONBOARDING_REQUIRED") {
          setErrors((e) => ({ ...e, stripe: msg, parcel: undefined }));
        } else {
          setErrors((e) => ({ ...e, images: msg, stripe: undefined, parcel: undefined }));
        }
      };

      if (editingListingId && !isWorkspaceDraft) {
        const res = await fetch(`/api/listings/${encodeURIComponent(editingListingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          await applyPublishError(res);
          return;
        }
        const j = (await res.json()) as { listing: StoredUserListing };
        publishedId = j.listing.id;
      } else if (isWorkspaceDraft && editingListingId) {
        const res = await fetch(`/api/listings/${encodeURIComponent(editingListingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          await applyPublishError(res);
          return;
        }
        const j = (await res.json()) as { listing: StoredUserListing };
        publishedId = j.listing.id;
        setWorkspaceListingId(null);
      } else {
        const res = await fetch("/api/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          await applyPublishError(res);
          return;
        }
        const j = (await res.json()) as { listing: StoredUserListing };
        publishedId = j.listing.id;
      }

      if (!publishedId) return;

      notifyListingsUpdated();
      window.localStorage.removeItem(DRAFT_KEY);
      setEditingListingId(null);
      setWorkspaceListingId(null);
      router.refresh();
      router.replace("/sell/create");
      if (opts?.addAnother) {
        resetFormForNextListing({
          category: addAnotherPreserve.category as MarketplaceCategory | "",
          condition: addAnotherPreserve.condition,
          format: addAnotherPreserve.format,
          preset: addAnotherPreserve.shippingPreset,
        });
        return;
      }
      setSuccess({ id: publishedId, href: `/seller/listings/${encodeURIComponent(publishedId)}` });
    } finally {
      setSubmitting(false);
    }
  };

  const estimateRequestSignature = useMemo(() => {
    const pw = parsePositiveDim(parcelWeightOz);
    const pl = parsePositiveDim(parcelLengthIn);
    const pwi = parsePositiveDim(parcelWidthIn);
    const ph = parsePositiveDim(parcelHeightIn);
    if (!shipFromAddressId || pw == null || pl == null || pwi == null || ph == null) return null;
    return JSON.stringify({ shipFromAddressId, shippingPreset, pw, pl, pwi, ph });
  }, [parcelHeightIn, parcelLengthIn, parcelWeightOz, parcelWidthIn, shipFromAddressId, shippingPreset]);

  const selectedShipFromAddress = useMemo(
    () => shipFromAddresses.find((addr) => addr.id === shipFromAddressId) ?? null,
    [shipFromAddressId, shipFromAddresses],
  );

  useEffect(() => {
    if (!estimateRequestSignature) {
      setEstimateGroups([]);
      return;
    }
    if (estimateRequestSignature === estimateSigRef.current) return;
    const id = window.setTimeout(async () => {
      setEstimateLoading(true);
      setEstimateError(null);
      try {
        const parsed = JSON.parse(estimateRequestSignature) as {
          shipFromAddressId: string;
          pw: number;
          pl: number;
          pwi: number;
          ph: number;
        };
        const res = await fetch("/api/shipping/estimate-listing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shipFromAddressId: parsed.shipFromAddressId,
            parcelWeightOz: parsed.pw,
            parcelLengthIn: parsed.pl,
            parcelWidthIn: parsed.pwi,
            parcelHeightIn: parsed.ph,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          groups?: Array<{ carrier: string; service: string; minCents: number; maxCents: number; sampleCount: number; currency: string }>;
          error?: string;
        };
        if (!res.ok) {
          setEstimateError(j.error ?? "Could not estimate shipping right now.");
          return;
        }
        setEstimateGroups(Array.isArray(j.groups) ? j.groups : []);
        estimateSigRef.current = estimateRequestSignature;
      } finally {
        setEstimateLoading(false);
      }
    }, 700);
    return () => window.clearTimeout(id);
  }, [estimateRequestSignature]);

  if (status === "loading") {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto w-full max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500 lg:px-10">Checking your session…</div>
      </main>
    );
  }

  if (status === "unauthenticated" || !session?.user) {
    return null;
  }

  if (success) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[min(380px,50vh)] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(201,162,39,0.1),transparent_55%)]"
          aria-hidden
        />
        <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center sm:py-24">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-bright/90">Seller hub</p>
          <h1 className="font-display mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Listing created</h1>
          <p className="mt-2 text-sm text-zinc-500">Your item is live on the marketplace.</p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href={success.href}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 shadow-[0_0_32px_-6px_rgba(201,162,39,0.55)] transition hover:brightness-110 sm:flex-none"
            >
              Open Seller Studio
            </Link>
            <button
              type="button"
              className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-white/[0.12] px-8 text-sm font-semibold text-zinc-200 transition hover:border-gold/35 hover:bg-white/[0.04] sm:flex-none"
              onClick={() => {
                resetFormForNextListing({
                  category: addAnotherPreserve.category as MarketplaceCategory | "",
                  condition: addAnotherPreserve.condition,
                  format: addAnotherPreserve.format,
                  preset: addAnotherPreserve.shippingPreset,
                });
              }}
            >
              Create another
            </button>
          </div>
          <Link href="/marketplace" className="mt-6 text-xs font-semibold text-gold-bright/90 hover:text-gold-bright">
            ← Back to marketplace
          </Link>
        </div>
      </main>
    );
  }

  const fieldClass =
    "h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3.5 text-sm text-foreground outline-none ring-gold/20 placeholder:text-zinc-600 focus:border-gold/40 focus:ring-2";
  const labelClass = "text-xs font-medium text-zinc-300";
  const validationState = validate();
  const readyToPublish = Object.keys(validationState).length === 0;
  const createDisabled = isCreateActionDisabled({
    hasReadinessIssues: !sellerCanPublish,
    submitting,
    draftSaving,
    hasValidationErrors: !readyToPublish,
  });
  const saveDraftDisabled = isSaveDraftDisabled({ submitting, draftSaving });
  const summaryFormat = buyingFormat === "auction" ? "Auction" : "Buy now";
  const summaryPrice = buyingFormat === "auction" ? startingBid || "—" : price || "—";
  const quickHiddenFields = getFieldsHiddenInQuickListMode(quickListMode);
  const showAdvancedShipping = isAdvancedShippingVisible({ quickListMode, expanded: shippingAdvancedOpen });
  const addAnotherPreserve = getAddAnotherPreservedValues({
    category,
    condition,
    format: buyingFormat,
    shippingPreset,
  });
  const conciseMissingRequirement = !readyToPublish
    ? validationState.title ?? validationState.price ?? validationState.startingBid ?? validationState.images ?? "Missing required fields."
    : null;

  if (readinessLoading) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto w-full max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500 lg:px-10">
          Checking seller readiness…
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(420px,55vh)] bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,rgba(201,162,39,0.08),transparent_55%)]"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-16 pt-4 sm:px-4 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
          <div>
            <Link href="/marketplace" className="text-[11px] font-semibold uppercase tracking-wider text-gold-bright/90 hover:text-gold-bright">
              ← Marketplace
            </Link>
            <h1 className="font-display mt-2 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Create listing</h1>
            <p className="mt-1 text-sm text-zinc-500">Signed in as @{session.user.username}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs">
            <Link href="/account/listings" className="font-medium text-gold-bright/90 underline-offset-2 hover:text-gold-bright hover:underline">
              My listings
            </Link>
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/signin" })}
              className="font-medium text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>

        {!sellerCanPublish ? (
          <section className="mt-6 rounded-2xl border border-amber-500/35 bg-amber-950/20 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100/90">Seller setup required</p>
            <p className="mt-2 text-sm font-semibold text-amber-100">Finish seller setup before publishing</p>
            {sellerReadinessIssues.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm text-amber-100/90">
                {sellerReadinessIssues.map((issue) => (
                  <li key={issue} className="rounded-lg border border-amber-500/20 bg-amber-950/25 px-3 py-2">
                    {issue}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4">
              <Link href="/account/seller" className="text-sm font-semibold text-gold-bright hover:underline">
                Open Account → Seller
              </Link>
            </div>
          </section>
        ) : null}

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-display text-xl font-bold text-foreground sm:text-2xl">Create listing</h2>
              <button
                type="button"
                onClick={() => setQuickListMode((v) => !v)}
                className={`w-full rounded-2xl p-3 text-left transition sm:w-auto sm:min-w-[320px] ${
                  quickListMode
                    ? "bg-gold/15 ring-1 ring-gold/40"
                    : "bg-[#0f0f13]/70 ring-1 ring-white/10 hover:ring-gold/30"
                }`}
              >
                <p className="text-sm font-semibold text-foreground">⚡ Quick List</p>
                <p className="mt-0.5 text-xs text-zinc-500">List live inventory in seconds with smart defaults.</p>
              </button>
            </div>

            <div className="grid gap-4 lg:min-h-[65vh] lg:grid-cols-2">
              <div className="space-y-3">
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileRef.current?.click();
                    }
                  }}
                  onDragEnter={onDragEnter}
                  onDragLeave={onDragLeave}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  className="rounded-3xl border border-dashed border-white/20 bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.07),transparent_55%),#0a0a0d] p-4 transition-all duration-300 hover:scale-[1.005] hover:border-gold/40"
                >
                  <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#0b0b0e]">
                    {images.length > 0 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={images[Math.min(activeImage, images.length - 1)]} alt="" className="h-full w-full scale-100 object-cover transition-all duration-300" />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                        <p className="text-lg font-semibold text-zinc-200">+ Add photos</p>
                        <p className="text-xs text-zinc-500">Drag & drop or click to upload</p>
                        <p className="text-[11px] text-zinc-600">First photo becomes the cover</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files?.length) void addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 transition hover:brightness-110"
                  >
                    + Add photos
                  </button>
                  <p className="mt-2 text-center text-[11px] text-zinc-500">JPG, PNG, or WebP · up to 12 photos · first image is cover</p>
                </div>
                {errors.images ? <p className="text-xs text-rose-300">{errors.images}</p> : null}
                {images.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {images.map((src, i) => (
                      <div
                        key={`${i}-${src}`}
                        draggable
                        onDragStart={() => setReorderDragIndex(i)}
                        onDragEnd={() => setReorderDragIndex(null)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (reorderDragIndex != null) reorderThumbnails(reorderDragIndex, i);
                          setReorderDragIndex(null);
                        }}
                        className="group relative size-16 cursor-grab overflow-hidden rounded-lg border border-white/10 transition-transform duration-200 hover:scale-105 active:cursor-grabbing"
                      >
                        <button type="button" onClick={() => setActiveImage(i)} className={`block h-full w-full ${activeImage === i ? "ring-2 ring-gold/60" : ""}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 text-[10px] font-bold text-zinc-200 opacity-0 transition group-hover:opacity-100"
                          aria-label="Remove photo"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="listing-title" className="text-[11px] font-medium text-zinc-500">
                    Title
                  </label>
                  <input
                    id="listing-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What are you selling?"
                    className="mt-1 h-14 w-full rounded-2xl bg-[#101014] px-4 text-lg text-foreground outline-none ring-1 ring-white/10 placeholder:text-zinc-600 focus:ring-2 focus:ring-gold/40"
                  />
                  <p className="mt-1 text-xs text-zinc-500">Example: 2019 rookie card, graded slab, team name</p>
                  {errors.title ? <p className="mt-1 text-xs text-rose-300">{errors.title}</p> : null}
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-zinc-500">Buying format</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBuyingFormat("buy_now")}
                      className={`rounded-2xl px-3 py-3 text-left text-sm transition ${
                        buyingFormat === "buy_now" ? "bg-gold/15 text-gold-bright ring-1 ring-gold/40" : "bg-white/[0.03] text-zinc-400 ring-1 ring-white/10"
                      }`}
                    >
                      Buy now
                    </button>
                    <button
                      type="button"
                      onClick={() => setBuyingFormat("auction")}
                      className={`rounded-2xl px-3 py-3 text-left text-sm transition ${
                        buyingFormat === "auction" ? "bg-gold/15 text-gold-bright ring-1 ring-gold/40" : "bg-white/[0.03] text-zinc-400 ring-1 ring-white/10"
                      }`}
                    >
                      Auction
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor={buyingFormat === "auction" ? "listing-start" : "listing-price"} className="text-[11px] font-medium text-zinc-500">
                    {buyingFormat === "auction" ? "Starting bid" : "Price"}
                  </label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-zinc-500">$</span>
                    <input
                      id={buyingFormat === "auction" ? "listing-start" : "listing-price"}
                      inputMode="decimal"
                      value={buyingFormat === "auction" ? startingBid : price}
                      onChange={(e) => (buyingFormat === "auction" ? setStartingBid(e.target.value) : setPrice(e.target.value))}
                      placeholder="0.00"
                      className="h-14 w-full rounded-2xl bg-[#101014] pl-10 pr-4 text-2xl font-semibold text-foreground outline-none ring-1 ring-white/10 placeholder:text-zinc-600 focus:ring-2 focus:ring-gold/40"
                    />
                  </div>
                  {buyingFormat === "auction" && errors.startingBid ? <p className="mt-1 text-xs text-rose-300">{errors.startingBid}</p> : null}
                  {buyingFormat === "buy_now" && errors.price ? <p className="mt-1 text-xs text-rose-300">{errors.price}</p> : null}
                </div>
                <button
                  type="button"
                  disabled={createDisabled}
                  onClick={() => void handleCreate()}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 transition hover:brightness-110 disabled:opacity-60"
                >
                  Sell now
                </button>
              </div>
            </div>

            {!quickListMode ? (
              <details className="rounded-2xl bg-[#0b0b0e]/70 p-4 ring-1 ring-white/10" open>
                <summary className="cursor-pointer text-sm font-semibold text-zinc-200">Details</summary>
                <div className="mt-4 space-y-4">
                  {!quickHiddenFields.includes("category") ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor="listing-category" className={labelClass}>
                          Category
                        </label>
                        <select id="listing-category" value={category} onChange={(e) => setCategory(e.target.value as MarketplaceCategory | "")} className={fieldClass}>
                          <option value="">Select category</option>
                          {CATEGORY_OPTIONS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        {errors.category ? <p className="text-xs text-rose-300">{errors.category}</p> : null}
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="listing-condition" className={labelClass}>
                          Condition
                        </label>
                        <select id="listing-condition" value={condition} onChange={(e) => setCondition(e.target.value)} className={fieldClass}>
                          <option value="">Select condition</option>
                          {CONDITION_OPTIONS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        {errors.condition ? <p className="text-xs text-rose-300">{errors.condition}</p> : null}
                      </div>
                    </div>
                  ) : null}

                  {buyingFormat === "auction" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor="listing-duration" className={labelClass}>
                          Auction duration
                        </label>
                        <select id="listing-duration" value={auctionDurationDays} onChange={(e) => setAuctionDurationDays(Number(e.target.value))} className={fieldClass}>
                          {AUCTION_DURATIONS.map((d) => (
                            <option key={d.value} value={d.value}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="listing-reserve" className={labelClass}>
                          Reserve price
                        </label>
                        <input id="listing-reserve" inputMode="decimal" value={reservePrice} onChange={(e) => setReservePrice(e.target.value)} placeholder="None" className={fieldClass} />
                      </div>
                    </div>
                  ) : null}

                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={allowOffers}
                      onChange={(e) => {
                        setAllowOffers(e.target.checked);
                        if (!e.target.checked) setErrors((err) => ({ ...err, minimumOffer: undefined }));
                      }}
                      className="size-4 rounded border-white/20 bg-[#0c0c10] accent-gold"
                    />
                    <span className="text-sm text-zinc-400">Allow offers</span>
                  </label>
                  {allowOffers ? (
                    <div className="space-y-1.5">
                      <label htmlFor="listing-min-offer" className={labelClass}>
                        Minimum offer (USD)
                      </label>
                      <input
                        id="listing-min-offer"
                        inputMode="decimal"
                        value={minimumOfferUsd}
                        onChange={(e) => {
                          setMinimumOfferUsd(e.target.value);
                          setErrors((err) => ({ ...err, minimumOffer: undefined }));
                        }}
                        placeholder="No minimum"
                        className={fieldClass}
                      />
                    </div>
                  ) : null}
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={acceptTradeOffers}
                      onChange={(e) => setAcceptTradeOffers(e.target.checked)}
                      className="mt-0.5 size-4 rounded border-white/20 bg-[#0c0c10] accent-gold"
                    />
                    <span className="text-sm text-zinc-400">
                      Accept trade offers
                      <span className="mt-0.5 block text-xs text-zinc-500">Let buyers offer cards, cash, or both.</span>
                    </span>
                  </label>
                  {!quickHiddenFields.includes("description") ? (
                    <div className="space-y-1.5">
                      <label htmlFor="listing-desc" className={labelClass}>
                        Description
                      </label>
                      <textarea
                        id="listing-desc"
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Describe your item details."
                        className={`${fieldClass} h-auto min-h-[110px] resize-y py-3`}
                      />
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}

            <details className="rounded-2xl bg-[#0b0b0e]/70 p-4 ring-1 ring-white/10" open={!quickListMode}>
              <summary className="cursor-pointer text-sm font-semibold text-zinc-200">Shipping</summary>
              <div className="mt-4 space-y-3">
                <p className="text-xs text-zinc-500">Choose a preset and we handle the rest.</p>

                <div className="rounded-2xl bg-[#111118] p-4 ring-1 ring-white/10">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-zinc-100">
                      {selectedShipFromAddress
                        ? `Shipping from ${selectedShipFromAddress.city}, ${selectedShipFromAddress.state}`
                        : "Select ship-from address"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShipFromSelectorOpen(true)}
                      className="text-xs font-semibold text-zinc-300 underline-offset-2 hover:text-zinc-100 hover:underline"
                    >
                      Change
                    </button>
                  </div>
                  <label htmlFor="listing-shipping-preset" className={`${labelClass} mt-3 block`}>
                    Shipping preset
                  </label>
                  <select id="listing-shipping-preset" value={shippingPreset} onChange={(e) => applyShippingPreset(e.target.value as ShippingPreset)} className={`${fieldClass} mt-1`}>
                    <option value="raw_card">Raw card</option>
                    <option value="slab">Slab</option>
                    <option value="small_collectible">Small collectible</option>
                    <option value="custom">Custom</option>
                  </select>
                  <p className="mt-2 text-xs text-zinc-500">Preset applies package defaults and keeps shipping fast.</p>
                </div>

                {!quickHiddenFields.includes("shippingAdvanced") ? (
                  <button
                    type="button"
                    onClick={() => setShippingAdvancedOpen((v) => !v)}
                    className="text-xs font-semibold text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
                  >
                    {shippingAdvancedOpen ? "Hide advanced live shipping settings" : "Advanced live shipping settings"}
                  </button>
                ) : null}

                <div className="rounded-2xl bg-[#111118] p-4 ring-1 ring-white/10">
                  <p className="text-sm font-semibold text-zinc-100">Estimated buyer shipping (US)</p>
                  {estimateLoading ? (
                    <div className="mt-3 space-y-2">
                      <div className="h-8 animate-pulse rounded-lg bg-white/5" />
                      <div className="h-8 animate-pulse rounded-lg bg-white/5" />
                    </div>
                  ) : null}
                  {estimateError ? (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-rose-500/25 bg-rose-950/20 px-3 py-2">
                      <p className="text-xs text-rose-200">Couldn&apos;t load estimates - Refresh</p>
                      <button
                        type="button"
                        onClick={() => {
                          estimateSigRef.current = "";
                        }}
                        className="text-xs font-semibold text-rose-100 underline-offset-2 hover:underline"
                      >
                        Refresh
                      </button>
                    </div>
                  ) : null}
                  {!estimateLoading && !estimateError && estimateGroups.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {estimateGroups.slice(0, 3).map((g) => (
                        <li key={`${g.carrier}-${g.service}`} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300">
                          <span>
                            {g.carrier} {g.service.includes("Ground") ? g.service : `${g.service}`}
                          </span>
                          <span>
                            ${(g.minCents / 100).toFixed(2)} - ${(g.maxCents / 100).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {!estimateLoading && !estimateError && estimateGroups.length === 0 ? (
                    <p className="mt-2 text-xs text-zinc-500">Calculating estimates automatically as shipping details become ready.</p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-zinc-500">Live shows calculate shipping automatically.</p>
                </div>

                {showAdvancedShipping ? (
                  <div className="rounded-2xl bg-[#111118] p-4 ring-1 ring-white/10">
                    <p className="text-xs text-zinc-500">Advanced shipping settings</p>
                    <div className="mt-3 space-y-4">
                      <div className="space-y-1.5">
                        <label htmlFor="listing-ship" className={labelClass}>
                          Buyer shipping (fixed)
                        </label>
                        <input id="listing-ship" inputMode="decimal" value={shippingPrice} onChange={(e) => setShippingPrice(e.target.value)} placeholder="0.00" className={fieldClass} />
                        <p className="text-xs text-zinc-500">Live shows calculate shipping automatically.</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input inputMode="decimal" placeholder="Weight (oz)" value={parcelWeightOz} onChange={(e) => setParcelWeightOz(e.target.value)} className={fieldClass} />
                        <input inputMode="decimal" placeholder="Length (in)" value={parcelLengthIn} onChange={(e) => setParcelLengthIn(e.target.value)} className={fieldClass} />
                        <input inputMode="decimal" placeholder="Width (in)" value={parcelWidthIn} onChange={(e) => setParcelWidthIn(e.target.value)} className={fieldClass} />
                        <input inputMode="decimal" placeholder="Height (in)" value={parcelHeightIn} onChange={(e) => setParcelHeightIn(e.target.value)} className={fieldClass} />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="space-y-1.5">
                        <span className={labelClass}>Shipping category</span>
                        <input value={shippingCategory} onChange={(e) => { setShippingCategory(e.target.value); setShippingPreset("custom"); }} className={fieldClass} />
                      </label>
                      <label className="space-y-1.5">
                        <span className={labelClass}>Base weight (oz)</span>
                        <input inputMode="decimal" value={shippingBaseWeightOz} onChange={(e) => { setShippingBaseWeightOz(e.target.value); setShippingPreset("custom"); }} className={fieldClass} />
                      </label>
                      <label className="space-y-1.5">
                        <span className={labelClass}>Incremental weight (oz)</span>
                        <input inputMode="decimal" value={shippingIncrementalWeightOz} onChange={(e) => { setShippingIncrementalWeightOz(e.target.value); setShippingPreset("custom"); }} className={fieldClass} />
                      </label>
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="listing-handle" className={labelClass}>
                      Handling time
                    </label>
                    <input id="listing-handle" value={handlingTime} onChange={(e) => setHandlingTime(e.target.value)} className={fieldClass} />
                  </div>
                  <label className="sm:col-span-2 flex cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={signatureRequired} onChange={(e) => setSignatureRequired(e.target.checked)} className="size-4 rounded border-white/20 bg-[#0c0c10] accent-gold" />
                    <span className="text-sm text-zinc-400">Signature required</span>
                  </label>
                </div>
                {errors.shippingProfile ? <p className="text-xs text-rose-300">{errors.shippingProfile}</p> : null}
                {errors.parcel ? <p className="text-xs text-rose-300">{errors.parcel}</p> : null}
              </div>
            </details>

            {shipFromSelectorOpen ? (
              <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                <button
                  type="button"
                  className="absolute inset-0 bg-black/70"
                  onClick={() => setShipFromSelectorOpen(false)}
                  aria-label="Close ship-from selector"
                />
                <div className="relative z-[1] w-full max-w-md rounded-2xl border border-white/10 bg-[#09090c] p-4 max-h-[85vh] overflow-hidden">
                  <p className="text-sm font-semibold text-zinc-100">Select ship-from address</p>
                  <div className="mt-3 space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                    {shipFromAddresses.map((addr) => (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => {
                          setShipFromAddressId(addr.id);
                          setShipFromSelectorOpen(false);
                        }}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                          shipFromAddressId === addr.id
                            ? "border-gold/40 bg-gold/10 text-zinc-100"
                            : "border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/20"
                        }`}
                      >
                        <p className="font-semibold">{addr.name}</p>
                        <p className="text-zinc-500">
                          {addr.city}, {addr.state}
                        </p>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-between">
                    <Link href="/account/seller" className="text-xs font-semibold text-gold-bright hover:underline">
                      Manage in Account - Seller
                    </Link>
                    <button
                      type="button"
                      onClick={() => setShipFromSelectorOpen(false)}
                      className="text-xs font-semibold text-zinc-300 hover:text-zinc-100"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setMobilePreviewOpen((v) => !v)}
                className="text-xs font-semibold text-zinc-300 underline-offset-2 hover:underline"
              >
                {mobilePreviewOpen ? "Hide preview" : "Show preview"}
              </button>
              {mobilePreviewOpen ? (
                <div className="mt-4 rounded-2xl bg-[#0b0b0e] p-4">
                  <div className="mx-auto max-w-[280px]">{previewListing ? <MarketplaceBrowseCard listing={previewListing} asPreview /> : null}</div>
                </div>
              ) : null}
            </div>

            {errors.stripe ? (
              <div className="rounded-xl border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-sm text-amber-100">
                {errors.stripe}{" "}
                <a href="/account/seller" className="font-semibold text-gold-bright underline-offset-2 hover:underline">
                  Open Seller settings
                </a>
              </div>
            ) : null}
            {errors.sellerReadiness ? (
              <div className="rounded-xl border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-sm text-amber-100">
                {errors.sellerReadiness}{" "}
                <a href="/account/seller" className="font-semibold text-gold-bright underline-offset-2 hover:underline">
                  Open Account → Seller
                </a>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                disabled={createDisabled}
                onClick={() => void handleCreate()}
                className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 transition hover:brightness-110 disabled:opacity-60"
              >
                Sell now
              </button>
              <button
                type="button"
                disabled={createDisabled}
                onClick={() => void handleCreate({ addAnother: true })}
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-zinc-200 transition hover:border-gold/35 hover:bg-white/[0.04] disabled:opacity-60"
              >
                List & add another
              </button>
              <button
                type="button"
                disabled={saveDraftDisabled}
                onClick={() => void handleSaveDraft()}
                className="inline-flex h-12 items-center justify-center rounded-full px-4 text-sm font-medium text-zinc-400 transition hover:text-zinc-200 disabled:opacity-60"
              >
                {draftSaving ? "Saving…" : "Save draft"}
              </button>
              <span className={`text-xs ${readyToPublish ? "text-emerald-300" : "text-zinc-500"}`}>{readyToPublish ? "Ready to list" : conciseMissingRequirement}</span>
            </div>
          </section>

          <aside className="hidden lg:block">
            <div className="sticky top-6 space-y-4 rounded-3xl bg-[#0b0b0e]/90 p-5 ring-1 ring-white/10 shadow-[0_20px_70px_-25px_rgba(201,162,39,0.35)]">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">👀 What buyers will see</p>
              <div className="mx-auto max-w-[320px] transition-all duration-300">{previewListing ? <MarketplaceBrowseCard listing={previewListing} asPreview /> : null}</div>
              <dl className="space-y-2 border-t border-white/10 pt-3 text-xs text-zinc-300">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-zinc-500">Format</dt>
                  <dd>{summaryFormat}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-zinc-500">{buyingFormat === "auction" ? "Start bid" : "Price"}</dt>
                  <dd>{summaryPrice}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-zinc-500">Shipping preset</dt>
                  <dd>{shippingPreset.replaceAll("_", " ")}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-zinc-500">Buyer shipping (fixed)</dt>
                  <dd>{shippingPrice || "0"}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-zinc-500">Package</dt>
                  <dd>{`${parcelWeightOz || "—"} oz · ${parcelLengthIn || "—"}x${parcelWidthIn || "—"}x${parcelHeightIn || "—"} in`}</dd>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                  <dt className="text-zinc-500">Ready status</dt>
                  <dd className={readyToPublish ? "text-emerald-300" : "text-amber-300"}>{readyToPublish ? "Ready to list" : "Needs details"}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
