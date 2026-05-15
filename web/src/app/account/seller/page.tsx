import { Suspense } from "react";
import { SellerHubPage } from "@/components/account/SellerHubPage";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-zinc-500">Loading…</div>}>
      <SellerHubPage />
    </Suspense>
  );
}
