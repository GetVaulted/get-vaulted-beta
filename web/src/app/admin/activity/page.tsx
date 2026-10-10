import Link from "next/link";
import { AdminCommandShell, adminPanelClassName, adminTableClassName } from "@/components/admin/AdminCommandShell";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ user?: string; type?: string; target?: string }>;

export default async function AdminActivityPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const where = {
    ...(sp.user ? { OR: [{ targetUserId: sp.user }, { adminUserId: sp.user }] } : {}),
    ...(sp.type ? { targetType: sp.type } : {}),
    ...(sp.target ? { targetId: sp.target } : {}),
  };
  const rows = await prisma.adminActionLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });

  const ids = [...new Set(rows.flatMap((r) => [r.adminUserId, r.targetUserId].filter((x): x is string => !!x)))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } })
    : [];
  const name = new Map(users.map((u) => [u.id, `@${u.username}`]));

  return (
    <AdminCommandShell
      title="Activity log"
      subtitle="Every change made from the admin console: who did it, to what, and why. Newest first, last 200."
    >
      <div className={`${adminPanelClassName} overflow-x-auto`}>
        <table className={adminTableClassName}>
          <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th>When</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Record</th>
              <th>Person</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-zinc-500">
                  Nothing logged yet. New admin actions will appear here.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-white/[0.05] align-top">
                  <td className="whitespace-nowrap text-zinc-400">{r.createdAt.toLocaleString()}</td>
                  <td>{name.get(r.adminUserId) ?? r.adminUserId.slice(0, 8)}</td>
                  <td className="font-mono text-zinc-300">{r.action}</td>
                  <td className="text-zinc-400">
                    {r.targetType} <span className="font-mono">{r.targetId.slice(0, 10)}</span>
                  </td>
                  <td>
                    {r.targetUserId ? (
                      <Link href={`/admin/users/${r.targetUserId}`} className="text-gold-bright hover:underline">
                        {name.get(r.targetUserId) ?? r.targetUserId.slice(0, 8)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-md text-zinc-400">{r.reason || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminCommandShell>
  );
}
