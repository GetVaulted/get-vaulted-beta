import { Suspense } from "react";
import { ObsWidgetPageClient } from "@/components/seller/obs/widgets/ObsWidgetPageClient";

export default async function Page({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return (
    <Suspense fallback={null}>
      <ObsWidgetPageClient kind={kind} />
    </Suspense>
  );
}
