import Link from "next/link";
import { formatAdminUsd } from "@/components/admin/AdminCommandShell";

export type AdminMetricCardProps = {
  label: string;
  value: string | number | null;
  hint?: string;
  href?: string;
  onClick?: () => void;
  tone?: "gold" | "neutral" | "warn";
  currency?: boolean;
};

export function AdminMetricCard({
  label,
  value,
  hint,
  href,
  onClick,
  tone = "neutral",
  currency,
}: AdminMetricCardProps) {
  const display =
    typeof value === "number"
      ? currency ||
        label.toLowerCase().includes("usd") ||
        label.toLowerCase().includes("gmv") ||
        label.toLowerCase().includes("payout") ||
        label.toLowerCase().includes("fee") ||
        label.toLowerCase().includes("cost") ||
        label.toLowerCase().includes("revenue") ||
        label.toLowerCase().includes("liability") ||
        label.toLowerCase().includes("refund") ||
        label.toLowerCase().includes("loss") ||
        label.toLowerCase().includes("variance") ||
        label.toLowerCase().includes("amount") ||
        label.toLowerCase().includes("proceeds") ||
        label.toLowerCase().includes("shipping") ||
        label.toLowerCase().includes("deduction") ||
        label.toLowerCase().includes("tax")
        ? formatAdminUsd(value)
        : value.toLocaleString()
      : (value ?? "—");

  const clickable = Boolean(href || onClick);
  const inner = (
    <div
      className={`rounded-xl border border-white/[0.08] bg-[#0a0a0d]/90 p-4 text-left transition ${
        tone === "gold" ? "ring-1 ring-inset ring-gold/15" : tone === "warn" ? "ring-1 ring-inset ring-amber-500/15" : ""
      } ${clickable ? "cursor-pointer hover:border-gold/30 hover:bg-[#0e0e12]" : ""}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
        {label}
        {clickable ? <span className="ml-1 text-zinc-600">↗</span> : null}
      </p>
      <p
        className={`mt-2 font-display text-2xl font-black tracking-tight ${
          tone === "gold" ? "text-gold-bright" : "text-foreground"
        }`}
      >
        {display}
      </p>
      {hint ? <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">{hint}</p> : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className="block w-full" onClick={onClick}>
        {inner}
      </button>
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
