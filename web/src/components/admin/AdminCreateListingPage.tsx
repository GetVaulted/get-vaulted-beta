"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export function AdminCreateListingPage() {
  const router = useRouter();
  const [sellerId, setSellerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Trading Cards");
  const [condition, setCondition] = useState("New");
  const [priceUsd, setPriceUsd] = useState("29.99");
  const [shippingPriceUsd, setShippingPriceUsd] = useState("5");
  const [status, setStatus] = useState<"draft" | "active">("draft");
  const [isCompanyListing, setIsCompanyListing] = useState(false);
  const [images, setImages] = useState("");
  const [parcelWeightOz, setParcelWeightOz] = useState("4");
  const [parcelLengthIn, setParcelLengthIn] = useState("10");
  const [parcelWidthIn, setParcelWidthIn] = useState("8");
  const [parcelHeightIn, setParcelHeightIn] = useState("4");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const imageUrls = images
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId: sellerId.trim(),
          title: title.trim(),
          description,
          category,
          condition,
          buyingFormat: "buy_now",
          priceUsd: Number(priceUsd),
          shippingPriceUsd: Number(shippingPriceUsd),
          status,
          isCompanyListing,
          images: imageUrls,
          parcelWeightOz: Number(parcelWeightOz),
          parcelLengthIn: Number(parcelLengthIn),
          parcelWidthIn: Number(parcelWidthIn),
          parcelHeightIn: Number(parcelHeightIn),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; listing?: { id: string } };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Create failed.");
        return;
      }
      if (j.listing?.id) {
        router.push(`/admin/listings`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }, [
    sellerId,
    title,
    description,
    category,
    condition,
    priceUsd,
    shippingPriceUsd,
    status,
    isCompanyListing,
    images,
    parcelWeightOz,
    parcelLengthIn,
    parcelWidthIn,
    parcelHeightIn,
    router,
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-3 py-8 sm:px-4 lg:px-10">
      <Link href="/admin/listings" className="text-xs font-semibold text-zinc-500 hover:text-zinc-300">
        ← Listings
      </Link>
      <h1 className="font-display mt-3 text-xl font-black tracking-tight">Create listing (admin)</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Creates a listing for the selected seller account. Use a company-operated seller user for official merch.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">{error}</p>
      ) : null}

      <div className="mt-6 space-y-4 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-5">
        <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Seller user id
          <input
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#050506] px-3 py-2 text-sm text-zinc-200"
            placeholder="cuid of seller"
            required
          />
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/[0.06] bg-black/30 p-3">
          <input
            type="checkbox"
            checked={isCompanyListing}
            onChange={(e) => setIsCompanyListing(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="text-sm font-semibold text-zinc-200">Company / Merch listing</span>
            <span className="mt-1 block text-xs text-zinc-500">
              Official Get Vaulted product sale. Marketplace seller fee is not charged.
            </span>
          </span>
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#050506] px-3 py-2 text-sm text-zinc-200"
            required
          />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#050506] px-3 py-2 text-sm text-zinc-200"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Category
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#050506] px-3 py-2 text-sm text-zinc-200"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Condition
            <input
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#050506] px-3 py-2 text-sm text-zinc-200"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Price (USD)
            <input
              value={priceUsd}
              onChange={(e) => setPriceUsd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#050506] px-3 py-2 text-sm text-zinc-200"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Shipping (USD)
            <input
              value={shippingPriceUsd}
              onChange={(e) => setShippingPriceUsd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#050506] px-3 py-2 text-sm text-zinc-200"
            />
          </label>
        </div>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "draft" | "active")}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#050506] px-3 py-2 text-sm text-zinc-200"
          >
            <option value="draft">Draft (no images required)</option>
            <option value="active">Active (requires images + parcel)</option>
          </select>
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Image URLs (one per line, required for active)
          <textarea
            value={images}
            onChange={(e) => setImages(e.target.value)}
            rows={3}
            placeholder="https://..."
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#050506] px-3 py-2 font-mono text-xs text-zinc-200"
          />
        </label>
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Parcel (required for active)</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            value={parcelWeightOz}
            onChange={(e) => setParcelWeightOz(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
            placeholder="oz"
          />
          <input
            value={parcelLengthIn}
            onChange={(e) => setParcelLengthIn(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
            placeholder="L in"
          />
          <input
            value={parcelWidthIn}
            onChange={(e) => setParcelWidthIn(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
            placeholder="W in"
          />
          <input
            value={parcelHeightIn}
            onChange={(e) => setParcelHeightIn(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#050506] px-2 py-1.5 text-xs text-zinc-200"
            placeholder="H in"
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="mt-2 w-full rounded-full bg-gradient-to-r from-gold to-gold-bright py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create listing"}
        </button>
      </div>
    </main>
  );
}
