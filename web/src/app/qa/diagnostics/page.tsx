import { notFound } from "next/navigation";
import { QaDiagnosticsPanel } from "@/components/qa/QaDiagnosticsPanel";
import { isQaSessionDebugAllowed } from "@/lib/qa-session-debug-allowed";

export const dynamic = "force-dynamic";

export default function QaDiagnosticsPage() {
  if (!isQaSessionDebugAllowed()) {
    notFound();
  }
  return (
    <main className="min-h-screen bg-[#05070a]">
      <QaDiagnosticsPanel />
    </main>
  );
}
