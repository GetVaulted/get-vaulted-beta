import { Suspense } from "react";
import { AccountSellerFinancialsPage } from "@/components/account/AccountSellerFinancialsPage";

export default function SellerFinancialsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center bg-[#030303] px-4 py-24 text-sm text-zinc-500">
          Loading…
        </main>
      }
    >
      <AccountSellerFinancialsPage />
    </Suspense>
  );
}
