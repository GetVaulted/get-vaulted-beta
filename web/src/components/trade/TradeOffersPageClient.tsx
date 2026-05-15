"use client";

import { useMemo, useState } from "react";
import { TradeOfferCard, type TradeOfferCardData } from "@/components/trade/TradeOfferCard";

type OfferFilter = "received" | "sent" | "active" | "completed" | "declined_expired";

const FILTERS: Array<{ id: OfferFilter; label: string }> = [
  { id: "received", label: "Received" },
  { id: "sent", label: "Sent" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "declined_expired", label: "Declined / Expired" },
];

function matchesFilter(offer: TradeOfferCardData & { proposerId: string; recipientId: string }, userId: string, f: OfferFilter): boolean {
  if (f === "received") return offer.recipientId === userId;
  if (f === "sent") return offer.proposerId === userId;
  if (f === "active") return offer.status === "pending" || offer.status === "countered";
  if (f === "completed") return offer.status === "accepted" || offer.status === "completed";
  return offer.status === "declined" || offer.status === "expired" || offer.status === "cancelled";
}

export function TradeOffersPageClient({
  userId,
  offers,
}: {
  userId: string;
  offers: Array<TradeOfferCardData & { proposerId: string; recipientId: string }>;
}) {
  const [filter, setFilter] = useState<OfferFilter>("received");

  const filtered = useMemo(() => offers.filter((offer) => matchesFilter(offer, userId, filter)), [filter, offers, userId]);

  return (
    <>
      <div className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const selected = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition sm:text-xs ${
                selected
                  ? "border-gold/45 bg-gold/12 text-gold-bright"
                  : "border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/18 hover:text-zinc-300"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-300">No offers in this filter yet.</p>
          <p className="mt-2 text-xs text-zinc-500">Try another filter, or start a new trade to create your first offer.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {filtered.map((offer) => (
            <TradeOfferCard
              key={offer.id}
              offer={offer}
              canAct={offer.status === "pending" || offer.status === "countered"}
            />
          ))}
        </div>
      )}
    </>
  );
}
