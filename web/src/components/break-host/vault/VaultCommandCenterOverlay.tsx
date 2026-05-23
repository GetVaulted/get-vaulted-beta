"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { HostRecentSalesTile } from "@/components/break-host/HostRecentSalesTile";
import { VaultQueueCarousel, type VaultQueueRow } from "@/components/break-host/vault/VaultQueueCarousel";
import type { VaultMode } from "@/components/break-host/vault/vault-modes";
import { VAULT_MODE_META } from "@/components/break-host/vault/vault-modes";
import type { HostRecentSaleRowDTO } from "@/lib/live-room-recent-sales";
import type { LiveShowFeeTierSnapshot } from "@/lib/platform-fee-policy";
import { LiveShowFeeTierTile } from "@/components/break-host/LiveShowFeeTierTile";

type HitLite = {
  id: string;
  title: string;
  spotLabel: string;
  buyer: { id: string; username: string } | null;
  createdAt: string;
};

type VaultCommandCenterOverlayProps = {
  open: boolean;
  onClose: () => void;
  roomId: string;
  roomTitle: string;
  roomStatus: string;
  viewerCount: number;
  streamTimerDisplay: string;
  busy: boolean;
  vaultMode: VaultMode;
  onVaultModeChange: (m: VaultMode) => void;
  onPatchRoom: (action: "start" | "end") => void;
  onOpenObs: () => void;
  onCopyPublic: () => void;
  onSoon: (label: string) => void;
  queueTab: "auction" | "bin" | "givvy" | "sold";
  onQueueTab: (t: "auction" | "bin" | "givvy" | "sold") => void;
  queueRows: VaultQueueRow[];
  selectedQueueItemId: string;
  onSelectQueueItem: (id: string) => void;
  onPostItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onAddAuction: () => void;
  recentSales: HostRecentSaleRowDTO[];
  feeTier?: LiveShowFeeTierSnapshot | null;
  hits: HitLite[];
};

function SectionTitle({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-2">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">{k}</p>
        <h3 className="mt-0.5 font-display text-sm font-bold tracking-tight text-white">{children}</h3>
      </div>
    </div>
  );
}

function GhostButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-left text-[11px] font-semibold text-zinc-200 transition hover:border-white/15 hover:bg-white/[0.06] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function VaultCommandCenterOverlay({
  open,
  onClose,
  roomId,
  roomTitle,
  roomStatus,
  viewerCount,
  streamTimerDisplay,
  busy,
  vaultMode,
  onVaultModeChange,
  onPatchRoom,
  onOpenObs,
  onCopyPublic,
  onSoon,
  queueTab,
  onQueueTab,
  queueRows,
  selectedQueueItemId,
  onSelectQueueItem,
  onPostItem,
  onDeleteItem,
  onAddAuction,
  recentSales,
  feeTier,
  hits,
}: VaultCommandCenterOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isLive = roomStatus === "live";
  const soldCount = queueRows.filter((r) => r.item.status === "sold").length;
  const activeCount = queueRows.filter((r) => r.item.status === "active").length;
  const revenueHint = recentSales.reduce((acc, r) => acc + (typeof r.amountUsd === "number" ? r.amountUsd : 0), 0);

  return (
    <div className="fixed inset-0 z-[72] flex items-end justify-center sm:items-center" role="dialog" aria-modal aria-label="Vault command center">
      <button type="button" aria-label="Dismiss" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mb-0 flex max-h-[min(92dvh,920px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/[0.1] bg-zinc-950/80 shadow-[0_-32px_120px_-40px_rgba(0,0,0,0.95)] backdrop-blur-2xl sm:mb-0 sm:rounded-3xl sm:border sm:shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/80">Vault command center</p>
            <p className="truncate font-display text-base font-bold text-white">{roomTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-white/[0.06]"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
          <section className="mb-8">
            <SectionTitle k="Vault modes">Set the room energy</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(Object.keys(VAULT_MODE_META) as VaultMode[]).map((m) => {
                const meta = VAULT_MODE_META[m];
                const on = vaultMode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onVaultModeChange(m)}
                    className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                      on
                        ? "border-amber-400/35 bg-amber-500/10 shadow-[0_0_28px_-14px_rgba(245,158,11,0.45)]"
                        : "border-white/[0.06] bg-black/30 hover:border-white/12"
                    }`}
                  >
                    <p className="text-[11px] font-bold text-white">{meta.label}</p>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-500">{meta.description}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mb-8">
            <SectionTitle k="A · Stream controls">Signal path</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {isLive ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPatchRoom("end")}
                  className="rounded-xl border border-rose-400/30 bg-rose-600/20 px-3 py-2.5 text-left text-[11px] font-bold text-rose-100 hover:bg-rose-600/30 disabled:opacity-40"
                >
                  End stream
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || roomStatus === "ended"}
                  onClick={() => onPatchRoom("start")}
                  className="rounded-xl border border-emerald-400/30 bg-emerald-600/20 px-3 py-2.5 text-left text-[11px] font-bold text-emerald-100 hover:bg-emerald-600/30 disabled:opacity-40"
                >
                  Go live
                </button>
              )}
              <GhostButton disabled={busy} onClick={() => onSoon("Pause stream")}>
                Pause stream
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Switch camera")}>
                Switch camera
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Mute mic")}>
                Mute mic
              </GhostButton>
              <GhostButton disabled={false} onClick={() => onSoon("Connection health")}>
                Connection · excellent
              </GhostButton>
              <GhostButton disabled={false} onClick={() => onSoon("Stream quality")}>
                Stream quality · auto
              </GhostButton>
              <button
                type="button"
                onClick={() => {
                  onOpenObs();
                  onClose();
                }}
                className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2.5 text-left text-[11px] font-bold text-amber-100 hover:bg-amber-500/15"
              >
                OBS / external ingest
              </button>
            </div>
            <p className="mt-2 text-[10px] text-zinc-600">Air time {streamTimerDisplay}</p>
          </section>

          <section className="mb-8">
            <SectionTitle k="B · Sales controls">Auction desk</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <GhostButton disabled={busy} onClick={() => onSoon("Start auction")}>
                Start auction
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Pin item")}>
                Pin item
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Buy now toggle")}>
                Buy now lane
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Sudden death mode")}>
                Sudden death
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Flash sale")}>
                Flash sale
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Giveaway launch")}>
                Giveaway launch
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Re-run item")}>
                Re-run item
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Queue next item")}>
                Queue next item
              </GhostButton>
            </div>
          </section>

          <section className="mb-8">
            <SectionTitle k="C · Audience controls">Room governance</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <GhostButton disabled={busy} onClick={() => onSoon("Verified buyers only")}>
                Verified buyers only
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Slow mode")}>
                Slow mode
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Mute users")}>
                Mute users
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Moderator controls")}>
                Moderator controls
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Polls")}>
                Polls
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Viewer milestones")}>
                Viewer milestones
              </GhostButton>
            </div>
          </section>

          <section className="mb-8">
            <SectionTitle k="D · Growth & promotion">Expand reach</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <GhostButton disabled={false} onClick={onCopyPublic}>
                Share live link
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Promote stream")}>
                Promote stream
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Invite followers")}>
                Invite followers
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Clip highlight")}>
                Clip highlight
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Raid another show")}>
                Raid another show
              </GhostButton>
              <GhostButton disabled={busy} onClick={() => onSoon("Multicast")}>
                Multicast
              </GhostButton>
            </div>
          </section>

          <section className="mb-8">
            <SectionTitle k="E · Analytics">Live pulse</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-white/[0.06] bg-black/40 px-3 py-2.5">
                <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Live viewers</p>
                <p className="mt-1 font-mono text-lg font-black text-white">{viewerCount}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/40 px-3 py-2.5">
                <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Active lots</p>
                <p className="mt-1 font-mono text-lg font-black text-emerald-200/95">{activeCount}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/40 px-3 py-2.5">
                <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Sold tonight</p>
                <p className="mt-1 font-mono text-lg font-black text-amber-200/95">{soldCount}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/40 px-3 py-2.5">
                <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Recent sales $</p>
                <p className="mt-1 font-mono text-lg font-black text-white">${revenueHint.toFixed(0)}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <LiveShowFeeTierTile tier={feeTier} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <GhostButton disabled={false} onClick={() => onSoon("Sell-through rate")}>
                Sell-through rate
              </GhostButton>
              <GhostButton disabled={false} onClick={() => onSoon("Average bid pace")}>
                Average bid pace
              </GhostButton>
              <GhostButton disabled={false} onClick={() => onSoon("Trending items")}>
                Trending items
              </GhostButton>
            </div>
            <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/35 p-3">
              <HostRecentSalesTile rows={recentSales} />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Hit feed</p>
              {hits.length === 0 ? <p className="text-[11px] text-zinc-600">No hits logged yet.</p> : null}
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {hits.slice(0, 12).map((h) => (
                  <div key={h.id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                    <p className="text-[11px] font-semibold text-zinc-100">{h.title}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      {h.spotLabel ? `${h.spotLabel} · ` : ""}
                      {h.buyer ? `@${h.buyer.username} · ` : ""}
                      {new Date(h.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mb-8">
            <SectionTitle k="Vault queue">Lanes & carousel</SectionTitle>
            <VaultQueueCarousel
              tab={queueTab}
              onTab={onQueueTab}
              rows={queueRows}
              selectedId={selectedQueueItemId}
              onSelect={onSelectQueueItem}
              viewerCount={viewerCount}
              busy={busy}
              onPost={onPostItem}
              onDelete={onDeleteItem}
              onAddAuction={onAddAuction}
            />
          </section>

          <section className="mb-4">
            <SectionTitle k="Broadcast network">Multicast fabric</SectionTitle>
            <div className="rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/10 via-black/40 to-black/70 p-4 shadow-[0_0_40px_-18px_rgba(34,211,238,0.25)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-100">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
                  Get Vaulted · live
                </span>
                <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-semibold text-zinc-400">
                  RTMP · standby
                </span>
                <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-semibold text-zinc-400">
                  Health · nominal
                </span>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
                Destinations stay hot-swappable. Wire TikTok / YouTube / secondary markets here — transport health surfaces before you
                multicast.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <GhostButton disabled={busy} onClick={() => onSoon("Add RTMP destination")}>
                  Add RTMP destination
                </GhostButton>
                <GhostButton disabled={busy} onClick={() => onSoon("Test egress")}>
                  Test egress
                </GhostButton>
              </div>
            </div>
          </section>

          <section>
            <SectionTitle k="Vault intelligence">AI copilots (preview)</SectionTitle>
            <div className="space-y-2">
              <div className="rounded-xl border border-dashed border-zinc-600/60 bg-zinc-950/50 px-3 py-2.5 text-[11px] text-zinc-500">
                AI clip generation — auto-build vertical highlights after hammer.
              </div>
              <div className="rounded-xl border border-dashed border-zinc-600/60 bg-zinc-950/50 px-3 py-2.5 text-[11px] text-zinc-500">
                AI title optimization — test winning titles before you go live.
              </div>
              <div className="rounded-xl border border-dashed border-zinc-600/60 bg-zinc-950/50 px-3 py-2.5 text-[11px] text-zinc-500">
                AI auction pacing — nudge timers when bid velocity spikes.
              </div>
              <div className="rounded-xl border border-dashed border-zinc-600/60 bg-zinc-950/50 px-3 py-2.5 text-[11px] text-zinc-500">
                AI moderation alerts — surface risky chat before it hits the room.
              </div>
            </div>
          </section>

          <div className="mt-8 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
            <Link
              href={`/live/${encodeURIComponent(roomId)}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold text-gold-bright hover:bg-white/[0.07]"
            >
              Open public room
            </Link>
            <Link href="/seller/live" className="rounded-full border border-white/10 px-4 py-2 text-[11px] text-zinc-400 hover:text-zinc-200">
              Seller hub
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
