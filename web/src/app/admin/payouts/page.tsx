import { Suspense } from "react";
import { AdminBankPayoutsPage } from "@/components/admin/AdminBankPayoutsPage";

export default function AdminPayoutsRoutePage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-zinc-500">Loading bank payouts…</p>}>
      <AdminBankPayoutsPage />
    </Suspense>
  );
}
