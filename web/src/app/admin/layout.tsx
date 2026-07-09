import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NOINDEX_METADATA } from "@/lib/site-seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = NOINDEX_METADATA;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    redirect("/signin?returnTo=%2Fadmin");
  }
  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, suspendedAt: true },
  });
  if (!row || row.suspendedAt || row.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_32%,#030303_100%)] text-foreground">
      <AdminNav />
      {children}
    </div>
  );
}
