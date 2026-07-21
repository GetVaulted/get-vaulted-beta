import { Suspense } from "react";
import { AdminListingsPage } from "@/components/admin/AdminListingsPage";

export default function Page() {
  return (
    <Suspense fallback={<main className="px-4 py-10 text-sm text-zinc-500">Loading listings…</main>}>
      <AdminListingsPage />
    </Suspense>
  );
}
