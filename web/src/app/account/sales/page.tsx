import { Suspense } from "react";
import { AccountSalesPage } from "@/components/account/AccountSalesPage";

function SalesFallback() {
  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<SalesFallback />}>
      <AccountSalesPage />
    </Suspense>
  );
}
