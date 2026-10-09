import { Suspense } from "react";
import { SellerApplicationPage } from "@/components/account/SellerApplicationPage";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-zinc-500">Loading…</div>}>
      <SellerApplicationPage />
    </Suspense>
  );
}
