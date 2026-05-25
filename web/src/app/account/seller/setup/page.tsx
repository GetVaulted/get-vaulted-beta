import { Suspense } from "react";
import { SellerSetupPage } from "@/components/account/SellerSetupPage";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-zinc-500">Loading…</div>}>
      <SellerSetupPage />
    </Suspense>
  );
}
