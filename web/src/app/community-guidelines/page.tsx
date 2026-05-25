import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Community Guidelines — Get Vaulted",
  description: "Community standards for buying, selling, livestreams, and messaging on Get Vaulted.",
};

export default function CommunityGuidelinesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
      <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
        ← Home
      </Link>
      <h1 className="font-display mt-6 text-2xl font-bold text-foreground">Community Guidelines</h1>
      <p className="mt-2 text-xs text-zinc-500">Last updated: May 24, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-300">
        <section>
          <p className="text-muted">
            Get Vaulted is built for collectors who want fair markets, transparent live selling, and respectful
            communities. These guidelines apply to all users — buyers, sellers, hosts, and moderators.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Be respectful</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Do not harass, threaten, dox, or discriminate against others.</li>
            <li>Keep chat and messages on-topic and appropriate for a public marketplace.</li>
            <li>Do not spam, brigade, or manipulate engagement metrics.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Sell and buy honestly</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>List only authentic, legal items with accurate photos and descriptions.</li>
            <li>Disclose damage, alterations, restoration, and grading limitations.</li>
            <li>Honor published break rules, auction terms, and shipping timelines.</li>
            <li>Do not bid without intent to pay or manipulate auction outcomes.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Livestream conduct</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Hosts must clearly explain break formats, odds, and fulfillment before sales.</li>
            <li>No misleading “guaranteed hit” claims unless expressly disclosed in writing.</li>
            <li>Follow moderator instructions and platform safety tools during live events.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Prohibited content</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Counterfeit, stolen, or infringing goods.</li>
            <li>Illegal drugs, weapons, or restricted regulated items.</li>
            <li>Sexually explicit content, hate speech, or glorification of violence.</li>
            <li>Scams, phishing, off-platform payment solicitation, or identity fraud.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Enforcement</h2>
          <p className="mt-3 text-muted">
            We may remove content, mute or ban users, withhold payouts, cancel listings, or suspend accounts when we
            believe these guidelines or our{" "}
            <Link href="/terms" className="font-semibold text-gold-bright hover:underline">
              Terms of Service
            </Link>{" "}
            were violated. Severe or repeated violations may result in permanent removal.
          </p>
        </section>

        <section id="reporting">
          <h2 className="font-display text-lg font-semibold text-foreground">Reporting concerns</h2>
          <p className="mt-3 text-muted">
            Use in-app report buttons on profiles, listings, live rooms, chat messages, and orders. For urgent safety
            issues, see our{" "}
            <Link href="/reporting-safety" className="font-semibold text-gold-bright hover:underline">
              Reporting &amp; Safety
            </Link>{" "}
            page or email{" "}
            <a href="mailto:support@shopgetvaulted.com" className="font-semibold text-gold-bright hover:underline">
              support@shopgetvaulted.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
