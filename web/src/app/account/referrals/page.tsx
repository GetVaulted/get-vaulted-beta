import { Suspense } from "react";
import { AccountReferralsPage } from "@/components/account/AccountReferralsPage";

export default function ReferralsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center bg-[#030303] px-4 py-24 text-sm text-zinc-500">
          Loading…
        </main>
      }
    >
      <AccountReferralsPage />
    </Suspense>
  );
}
