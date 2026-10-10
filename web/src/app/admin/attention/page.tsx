import Link from "next/link";
import { AdminCommandShell, adminPanelClassName } from "@/components/admin/AdminCommandShell";
import { loadAttentionItems } from "@/lib/admin/admin-attention";

export const dynamic = "force-dynamic";

const TONE = {
  critical: "border-red-400/40 text-red-300",
  warning: "border-amber-400/40 text-amber-300",
  info: "border-white/15 text-zinc-300",
} as const;

export default async function AdminAttentionPage() {
  const items = await loadAttentionItems();
  return (
    <AdminCommandShell title="Needs attention" subtitle="Everything that is waiting on you, most urgent first.">
      {items.length === 0 ? (
        <div className={`${adminPanelClassName} p-6 text-sm text-zinc-300`}>All clear. Nothing is waiting on you right now.</div>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.key}>
              <Link href={i.href} className={`${adminPanelClassName} flex items-center justify-between gap-4 p-4 hover:border-white/20`}>
                <span>
                  <span className="block text-sm text-foreground">{i.title}</span>
                  <span className="mt-1 block text-xs text-zinc-500">{i.detail}</span>
                </span>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold tabular-nums ${TONE[i.severity]}`}>{i.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminCommandShell>
  );
}
