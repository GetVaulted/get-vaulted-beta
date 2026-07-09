"use client";

import { useState } from "react";
import { adminButtonPrimaryClassName } from "@/components/admin/AdminCommandShell";

type Props = {
  report: string;
  params?: Record<string, string | undefined>;
  label?: string;
  className?: string;
};

function parseFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const match = /filename="([^"]+)"/i.exec(contentDisposition);
  return match?.[1] ?? null;
}

export function AdminCsvExportButton({ report, params, label = "Export CSV", className }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportCsv = async () => {
    setBusy(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ report });
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value != null && value !== "") sp.set(key, value);
        }
      }

      const res = await fetch(`/api/admin/export?${sp.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(typeof j.error === "string" ? j.error : `Export failed (${res.status}).`);
        return;
      }

      const blob = await res.blob();
      const filename = parseFilename(res.headers.get("Content-Disposition")) ?? `${report}.csv`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void exportCsv()}
        className={adminButtonPrimaryClassName}
      >
        {busy ? "Exporting…" : label}
      </button>
      {error ? <p className="mt-1 text-[10px] text-rose-300">{error}</p> : null}
    </div>
  );
}
