"use client";

import { useSearchParams } from "next/navigation";
import {
  ObsBidWidget,
  ObsBreakWidget,
  ObsSoldWidget,
  ObsTipsWidget,
  ObsViewersWidget,
  useObsWidgetRoom,
} from "@/components/seller/obs/widgets/ObsWidgetOverlays";
import type { ObsWidgetKind } from "@/lib/obs-studio-copy";
import { OBS_WIDGETS } from "@/lib/obs-studio-copy";

const VALID: ObsWidgetKind[] = OBS_WIDGETS.map((w) => w.id);

export function ObsWidgetPageClient({ kind }: { kind: string }) {
  const params = useSearchParams();
  const roomId = (params.get("roomId") ?? "").trim();
  const token = (params.get("token") ?? "").trim();
  const validKind = VALID.includes(kind as ObsWidgetKind);
  const { snap, error } = useObsWidgetRoom(validKind && roomId && token ? roomId : null, token || null);

  if (!validKind) {
    return <p className="p-4 text-sm text-zinc-500">Unknown widget.</p>;
  }

  if (!roomId || !token) {
    return <p className="p-4 text-sm text-zinc-500">Missing roomId or token in URL.</p>;
  }

  if (error) {
    return <p className="p-4 text-sm text-rose-300">{error}</p>;
  }

  return (
    <div data-obs-widget-root className="flex min-h-[120px] items-start justify-start bg-transparent p-2">
      {kind === "bid" ? <ObsBidWidget snap={snap} /> : null}
      {kind === "sold" ? <ObsSoldWidget snap={snap} /> : null}
      {kind === "break" ? <ObsBreakWidget snap={snap} /> : null}
      {kind === "viewers" ? <ObsViewersWidget snap={snap} /> : null}
      {kind === "tips" ? <ObsTipsWidget snap={snap} /> : null}
    </div>
  );
}
