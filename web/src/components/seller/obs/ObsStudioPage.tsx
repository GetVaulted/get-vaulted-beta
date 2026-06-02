"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireSellerActivation } from "@/hooks/useRequireSellerActivation";
import { useObsWidgetToken } from "@/hooks/useObsWidgetToken";
import { useObsStreamSetup } from "@/hooks/useObsStreamSetup";
import { useObsStudioShows } from "@/hooks/useObsStudioShows";
import { OBS_STUDIO } from "@/lib/obs-studio-copy";
import { SELLER_OBS_PATH } from "@/lib/obs-seller-paths";
import { SELLER_SETUP_PATH } from "@/lib/seller-setup-state";
import { WATCHLIST_TOAST_EVENT } from "@/lib/watchlist-events";
import { ObsHelpCenter } from "@/components/seller/obs/ObsHelpCenter";
import { ObsQuickSetupCard } from "@/components/seller/obs/ObsQuickSetupCard";
import { ObsStreamSettingsCard } from "@/components/seller/obs/ObsStreamSettingsCard";
import { ObsUpcomingShowsTable } from "@/components/seller/obs/ObsUpcomingShowsTable";
import { ObsWidgetsPanel } from "@/components/seller/obs/ObsWidgetsPanel";
import { SellerHubNav } from "@/components/seller/obs/SellerHubNav";

export function ObsStudioPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { ready: sellerReady, loading: sellerGateLoading } = useRequireSellerActivation();
  const sellerId = session?.user?.id;

  const shows = useObsStudioShows(sellerId);
  const streamSetup = useObsStreamSetup(shows.selectedId, shows.selected?.status ?? null);
  const widgetToken = useObsWidgetToken(shows.selectedId);
  const settingsRef = useRef<HTMLDivElement>(null);

  const toast = useCallback((message: string) => {
    window.dispatchEvent(new CustomEvent(WATCHLIST_TOAST_EVENT, { detail: { message } }));
  }, []);

  const scrollToSettings = useCallback((id: string) => {
    shows.setSelectedId(id);
    window.setTimeout(() => {
      settingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, [shows]);

  useEffect(() => {
    if (status === "authenticated" && !sellerGateLoading && !sellerReady) {
      router.replace(SELLER_SETUP_PATH);
    }
  }, [status, sellerGateLoading, sellerReady, router]);

  if (status === "unauthenticated") {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-lg px-4 py-24 text-center text-sm text-zinc-400">
          <Link href={`/signin?returnTo=${encodeURIComponent(SELLER_OBS_PATH)}`} className="font-semibold text-gold-bright hover:underline">
            Sign in
          </Link>{" "}
          to open OBS Studio.
        </div>
      </main>
    );
  }

  if (status === "loading" || sellerGateLoading || !sellerReady) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading OBS Studio…</div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-16 pt-5 sm:px-4 lg:px-10">
        <header className="rounded-2xl border border-white/[0.09] bg-[linear-gradient(180deg,rgba(24,24,29,0.88)_0%,rgba(10,10,13,0.86)_100%)] p-5 shadow-[0_24px_60px_-36px_rgba(0,0,0,0.8)] sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Seller HQ</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">{OBS_STUDIO.pageTitle}</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-zinc-400">{OBS_STUDIO.pageSubtitle}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/seller/live"
              className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950"
            >
              {OBS_STUDIO.scheduleShow}
            </Link>
            {shows.selected ? (
              <button
                type="button"
                onClick={() => scrollToSettings(shows.selected!.id)}
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-zinc-100"
              >
                {OBS_STUDIO.streamSettingsBtn}
              </button>
            ) : null}
          </div>
        </header>

        <SellerHubNav activeHref={SELLER_OBS_PATH} />

        {shows.error ? (
          <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{shows.error}</p>
        ) : null}

        <section className="mt-6">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{OBS_STUDIO.upcomingShows}</p>
          <ObsUpcomingShowsTable
            rows={shows.rows}
            loading={shows.loading}
            selectedId={shows.selectedId}
            startBusyId={shows.startBusyId}
            onSelect={shows.setSelectedId}
            onStart={(id) => void shows.startShow(id)}
            onOpenStreamSettings={scrollToSettings}
          />
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <ObsQuickSetupCard setup={streamSetup} disabled={!shows.selectedId} />
          <div ref={settingsRef}>
            <ObsStreamSettingsCard
              setup={streamSetup}
              showTitle={shows.selected?.title ?? null}
              disabled={!shows.selectedId}
            />
          </div>
        </div>

        <div className="mt-6">
          <ObsWidgetsPanel roomId={shows.selectedId} tokenState={widgetToken} onCopy={toast} />
        </div>

        <div className="mt-6">
          <ObsHelpCenter />
        </div>
      </div>
    </main>
  );
}
