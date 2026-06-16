import Link from "next/link";
import { ADMIN_PRIMARY_MODULES, adminAccentClasses, type AdminModuleDef } from "@/lib/admin/admin-modules";

export function AdminModuleGrid({ modules = ADMIN_PRIMARY_MODULES }: { modules?: AdminModuleDef[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {modules.map((m) => {
        const accent = adminAccentClasses(m.accent);
        return (
          <li key={m.id}>
            <Link
              href={m.href}
              className={`group block h-full rounded-xl border border-white/[0.08] bg-[#0a0a0d]/90 p-5 ring-1 ring-inset ${accent.ring} transition hover:border-gold/25 hover:bg-white/[0.02]`}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className={`text-sm font-bold ${accent.text}`}>{m.title}</h2>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${accent.bg} ${accent.text}`}>
                  Open
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">{m.description}</p>
              {m.legacyHref ? (
                <p className="mt-3 text-[10px] text-zinc-600">
                  Legacy view:{" "}
                  <span className="text-zinc-400 underline-offset-2 group-hover:underline">{m.legacyHref}</span>
                </p>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
