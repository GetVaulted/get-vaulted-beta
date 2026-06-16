import Link from "next/link";
import { formatAdminUsd } from "@/components/admin/AdminCommandShell";

export type AdminMetricCardProps = {
  label: string;
  value: string | number | null;
  hint?: string;
  href?: string;
  tone?: "gold" | "neutral" | "warn";
  currency?: boolean;
};

export function AdminMetricCard({ label, value, hint, href, tone = "neutral", currency }: AdminMetricCardProps) {
  const display =
    typeof value === "number"
      ? currency || label.toLowerCase().includes("usd") || label.toLowerCase().includes("gmv") || label.toLowerCase().includes("payout") || label.toLowerCase().includes("fee")
        ? formatAdminUsd(value)
        : value.toLocaleString()
      : value ?? "—";

  const inner = (
    <div
      className={`rounded-xl border border-white/[0.08] bg-[#0a0a0d]/90 p-4 ${
        tone === "gold" ? "ring-1 ring-inset ring-gold/15" : tone === "warn" ? "ring-1 ring-inset ring-amber-500/15" : ""
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-2 font-display text-2xl font-black tracking-tight ${tone === "gold" ? "text-gold-bright" : "text-foreground"}`}>
        {display}
      </p>
      {hint ? <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">{hint}</p> : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition hover:opacity-90">
        {inner}
      </Link>
    );
  }
  return inner;
}

export function AdminMetricStrip({ metrics }: { metrics: AdminMetricCardProps[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {metrics.map((m) => (
        <AdminMetricCard key={m.label} {...m} />
      ))}
    </div>
  );
}
