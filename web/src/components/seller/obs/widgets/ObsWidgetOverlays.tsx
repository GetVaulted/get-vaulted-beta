"use client";

import { useEffect, useState } from "react";
import type { ObsWidgetSnapshotDTO } from "@/lib/obs-widget-snapshot";

export type ObsWidgetRoomSnapshot = {
  title: string;
  status: string;
  roomType: string;
  viewerCount: number;
  activeItem: ObsWidgetSnapshotDTO["activeItem"];
  recentTipBodies: string[];
  breakPhaseLabel: string | null;
  breakSpotsOpen: number | null;
  auctionEndsAt: string | null;
};

function mapSnapshot(dto: ObsWidgetSnapshotDTO): ObsWidgetRoomSnapshot {
  return {
    title: dto.title,
    status: dto.status,
    roomType: dto.roomType,
    viewerCount: dto.viewerCount,
    activeItem: dto.activeItem,
    recentTipBodies: dto.recentTipBodies,
    breakPhaseLabel: dto.breakPhaseLabel,
    breakSpotsOpen: dto.breakSpotsOpen,
    auctionEndsAt: dto.activeItem?.auctionEndsAt ?? null,
  };
}

export function useObsWidgetRoom(roomId: string | null, token: string | null, pollMs = 2500) {
  const [snap, setSnap] = useState<ObsWidgetRoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId || !token?.trim()) {
      setSnap(null);
      setError(roomId && !token?.trim() ? "Missing widget token." : null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const q = new URLSearchParams({ token: token.trim() });
        const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/obs-widget?${q.toString()}`, {
          cache: "no-store",
        });
        if (res.status === 401) {
          if (!cancelled) setError("Invalid or expired widget token.");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError("Could not load overlay data.");
          return;
        }
        const j = (await res.json()) as { snapshot?: ObsWidgetSnapshotDTO };
        if (!j.snapshot) {
          if (!cancelled) setError("Could not load overlay data.");
          return;
        }
        if (!cancelled) {
          setSnap(mapSnapshot(j.snapshot));
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not load overlay data.");
      }
    };

    void load();
    const id = window.setInterval(() => void load(), pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [roomId, token, pollMs]);

  return { snap, error };
}

function fmtUsd(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
}

export function ObsBidWidget({ snap }: { snap: ObsWidgetRoomSnapshot | null }) {
  const item = snap?.activeItem;
  const bid = item?.currentBidUsd ?? item?.startingBidUsd ?? item?.priceUsd;
  return (
    <div className="inline-block min-w-[280px] rounded-2xl border border-gold/40 bg-black/75 px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-bright">Current lot</p>
      <p className="mt-1 max-w-[320px] truncate text-lg font-bold text-white">{item?.title ?? "Waiting for lot…"}</p>
      <p className="mt-2 font-display text-3xl font-black tabular-nums text-gold-bright">{fmtUsd(bid ?? null)}</p>
      {item?.lastHighBidderUsername ? (
        <p className="mt-1 text-sm text-zinc-300">@{item.lastHighBidderUsername}</p>
      ) : null}
      {snap?.auctionEndsAt && item?.biddingOpen ? (
        <p className="mt-2 text-[11px] font-semibold tabular-nums text-zinc-400">
          Ends {new Date(snap.auctionEndsAt).toLocaleTimeString()}
        </p>
      ) : null}
    </div>
  );
}

export function ObsSoldWidget({ snap }: { snap: ObsWidgetRoomSnapshot | null }) {
  const sold = snap?.activeItem?.status === "sold";
  if (!sold) return null;
  return (
    <div className="inline-block animate-pulse rounded-2xl border-2 border-emerald-400/60 bg-emerald-950/90 px-8 py-5 shadow-[0_0_40px_rgba(16,185,129,0.35)]">
      <p className="font-display text-4xl font-black uppercase tracking-wide text-emerald-200">Sold!</p>
      <p className="mt-1 max-w-xs truncate text-sm text-emerald-100/90">{snap?.activeItem?.title}</p>
    </div>
  );
}

export function ObsBreakWidget({ snap }: { snap: ObsWidgetRoomSnapshot | null }) {
  if (snap?.roomType !== "break") {
    return (
      <div className="inline-block rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm text-zinc-400">
        Break overlay — not a break show
      </div>
    );
  }
  return (
    <div className="inline-block min-w-[260px] rounded-2xl border border-violet-400/35 bg-violet-950/80 px-5 py-4">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-200">Break</p>
      <p className="mt-1 text-lg font-bold text-white">{snap.title}</p>
      <p className="mt-2 text-sm capitalize text-violet-100/90">{snap.breakPhaseLabel?.replace(/_/g, " ") ?? "Live break"}</p>
      {typeof snap.breakSpotsOpen === "number" ? (
        <p className="mt-1 text-xs font-bold text-violet-200/90">{snap.breakSpotsOpen} spots open</p>
      ) : null}
    </div>
  );
}

export function ObsViewersWidget({ snap }: { snap: ObsWidgetRoomSnapshot | null }) {
  const n = snap?.viewerCount ?? 0;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-4 py-2">
      <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
      <span className="text-sm font-black tabular-nums text-white">{n.toLocaleString()}</span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">viewers</span>
    </div>
  );
}

export function ObsTipsWidget({ snap }: { snap: ObsWidgetRoomSnapshot | null }) {
  const tip = snap?.recentTipBodies.at(-1);
  if (!tip) return null;
  return (
    <div className="inline-block max-w-md rounded-2xl border border-gold/35 bg-zinc-950/90 px-5 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold-bright">Tip</p>
      <p className="mt-1 text-sm leading-snug text-zinc-100">{tip}</p>
    </div>
  );
}
