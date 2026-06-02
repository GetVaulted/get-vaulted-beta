"use client";

import Link from "next/link";
import type { ObsStudioShowRow } from "@/hooks/useObsStudioShows";
import { OBS_STUDIO } from "@/lib/obs-studio-copy";
import { sellerShowConsolePath } from "@/lib/obs-seller-paths";

function formatSchedule(row: ObsStudioShowRow): string {
  if (row.status === "live") return "Live now";
  if (row.scheduledStartAt) {
    return new Date(row.scheduledStartAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  }
  return "Start when ready";
}

function statusBadge(status: ObsStudioShowRow["status"]) {
  if (status === "live") return "border-emerald-500/35 bg-emerald-950/40 text-emerald-200";
  return "border-amber-500/30 bg-amber-950/30 text-amber-100";
}

type Props = {
  rows: ObsStudioShowRow[];
  loading: boolean;
  selectedId: string | null;
  startBusyId: string | null;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onOpenStreamSettings: (id: string) => void;
};

export function ObsUpcomingShowsTable({
  rows,
  loading,
  selectedId,
  startBusyId,
  onSelect,
  onStart,
  onOpenStreamSettings,
}: Props) {
  if (loading) {
    return <p className="py-8 text-center text-sm text-zinc-500">Loading shows…</p>;
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center">
        <p className="text-sm text-zinc-400">{OBS_STUDIO.noShows}</p>
        <Link
          href="/seller/live"
          className="mt-4 inline-flex min-h-10 items-center rounded-full bg-gold px-5 text-xs font-bold text-zinc-950"
        >
          {OBS_STUDIO.scheduleShow}
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] bg-black/30 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Schedule</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = row.id === selectedId;
            return (
              <tr
                key={row.id}
                className={`border-b border-white/[0.06] ${selected ? "bg-gold/[0.06]" : "hover:bg-white/[0.02]"}`}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelect(row.id)}
                    className="text-left font-semibold text-zinc-100 hover:text-gold-bright"
                  >
                    {row.title}
                  </button>
                  <p className="mt-0.5 text-[11px] capitalize text-zinc-500">{row.roomType}</p>
                </td>
                <td className="px-4 py-3 text-zinc-300">{formatSchedule(row)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadge(row.status)}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Link
                      href={sellerShowConsolePath(row.id, row.roomType)}
                      className="rounded-lg border border-white/12 px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 hover:bg-white/[0.06]"
                    >
                      {OBS_STUDIO.openShow}
                    </Link>
                    {row.status === "scheduled" ? (
                      <button
                        type="button"
                        disabled={startBusyId === row.id}
                        onClick={() => void onStart(row.id)}
                        className="rounded-lg border border-gold/35 bg-gold/10 px-2.5 py-1.5 text-[11px] font-bold text-gold-bright hover:bg-gold/15 disabled:opacity-50"
                      >
                        {startBusyId === row.id ? "Starting…" : OBS_STUDIO.startShow}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(row.id);
                        onOpenStreamSettings(row.id);
                      }}
                      className="rounded-lg border border-white/12 px-2.5 py-1.5 text-[11px] font-bold text-zinc-300 hover:bg-white/[0.06]"
                    >
                      {OBS_STUDIO.streamSettingsBtn}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
