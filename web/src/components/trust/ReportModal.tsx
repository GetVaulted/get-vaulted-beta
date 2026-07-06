"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReportReason, ReportTargetType } from "@/generated/prisma/enums";
import { REPORT_REASON_LABELS, REPORT_REASONS, REPORT_TARGET_LABELS } from "@/lib/trust/report-types";

type Props = {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  liveRoomId?: string | null;
  label?: string;
};

export function ReportModal({ open, onClose, targetType, targetId, liveRoomId, label }: Props) {
  const [reason, setReason] = useState<ReportReason>("other");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          description,
          liveRoomId: liveRoomId ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not submit report.");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const title = label ?? `Report ${REPORT_TARGET_LABELS[targetType]}`;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0a0a0d] p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
      >
        <h2 id="report-modal-title" className="font-display text-lg font-bold text-foreground">
          {done ? "Report submitted" : title}
        </h2>
        {done ? (
          <>
            <p className="mt-3 text-sm text-zinc-400">
              Thanks — our trust & safety team will review this. You may be contacted if we need more information.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-gold/90 text-sm font-bold text-zinc-950"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-xs text-zinc-500">Reports are reviewed by moderators. False reports may affect your account.</p>
            <label className="mt-4 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Reason
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as ReportReason)}
                className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#08080a] px-3 py-2 text-sm text-zinc-200"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {REPORT_REASON_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Details (optional)
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 4000))}
                rows={4}
                placeholder="What happened?"
                className="mt-1 w-full resize-none rounded-lg border border-white/[0.08] bg-[#08080a] px-3 py-2 text-sm text-zinc-200"
              />
            </label>
            {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-white/10 text-sm font-semibold text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-rose-600/90 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? "Sending…" : "Submit report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ReportTrigger({
  targetType,
  targetId,
  liveRoomId,
  className,
  children,
}: {
  targetType: ReportTargetType;
  targetId: string;
  liveRoomId?: string | null;
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children ?? "Report"}
      </button>
      <ReportModal
        open={open}
        onClose={() => setOpen(false)}
        targetType={targetType}
        targetId={targetId}
        liveRoomId={liveRoomId}
      />
    </>
  );
}
