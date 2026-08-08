import { Suspense } from "react";
import { AdminPayPalPayoutsPage } from "@/components/admin/AdminPayPalPayoutsPage";

export default function AdminPayPalPayoutsRoutePage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-zinc-500">Loading PayPal payouts…</p>}>
      <AdminPayPalPayoutsPage />
    </Suspense>
  );
}
