import { Suspense } from "react";
import { MyAccountPage } from "@/components/account/MyAccountPage";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center bg-[#030303] px-4 py-24 text-sm text-zinc-500">
          Loading…
        </main>
      }
    >
      <MyAccountPage />
    </Suspense>
  );
}
