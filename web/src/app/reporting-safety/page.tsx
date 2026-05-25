import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reporting & Safety — Get Vaulted",
  description: "How to report abuse, fraud, and safety issues on Get Vaulted.",
};

export default function ReportingSafetyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
      <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
        ← Home
      </Link>
      <h1 className="font-display mt-6 text-2xl font-bold text-foreground">Reporting &amp; Safety</h1>
      <p className="mt-2 text-xs text-zinc-500">Last updated: May 24, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-300">
        <section>
          <p className="text-muted">
            If you see behavior that violates our{" "}
            <Link href="/community-guidelines" className="font-semibold text-gold-bright hover:underline">
              Community Guidelines
            </Link>{" "}
            or{" "}
            <Link href="/terms" className="font-semibold text-gold-bright hover:underline">
              Terms of Service
            </Link>
            , report it so our team can review and take action.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">In-app reporting</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Profiles and storefronts — report from the profile menu.</li>
            <li>Marketplace listings — report from the listing actions menu.</li>
            <li>Live rooms and chat — report messages or the show from live moderation tools.</li>
            <li>Orders and messages — report from order detail or thread menus.</li>
          </ul>
          <p className="mt-3 text-muted">
            Reports are reviewed by our trust &amp; safety team. You may not receive individual outcome details when
            privacy or legal constraints apply.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Urgent safety issues</h2>
          <p className="mt-3 text-muted">
            If someone is in immediate danger, contact local emergency services first. Then email{" "}
            <a href="mailto:support@shopgetvaulted.com" className="font-semibold text-gold-bright hover:underline">
              support@shopgetvaulted.com
            </a>{" "}
            with subject line <strong className="text-zinc-200">URGENT SAFETY</strong> and include links, usernames,
            and timestamps when possible.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Fraud and payment abuse</h2>
          <p className="mt-3 text-muted">
            Report suspected fraud, chargeback abuse, or off-platform payment requests through in-app reports or
            support. Do not send payment outside Get Vaulted checkout unless explicitly allowed in writing by Get
            Vaulted.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Law enforcement</h2>
          <p className="mt-3 text-muted">
            Get Vaulted LLC may preserve and disclose information when required by law or valid legal process. Law
            enforcement may contact{" "}
            <a href="mailto:support@shopgetvaulted.com" className="font-semibold text-gold-bright hover:underline">
              support@shopgetvaulted.com
            </a>{" "}
            with appropriate documentation.
          </p>
        </section>
      </div>
    </main>
  );
}
