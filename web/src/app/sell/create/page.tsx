import { Suspense } from "react";
import { CreateListingPage } from "@/components/sell/CreateListingPage";

export default function SellCreatePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)] px-4 py-24 text-sm text-zinc-500">
          Loading…
        </main>
      }
    >
      <CreateListingPage />
    </Suspense>
  );
}
