import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prohibited Items Policy — Get Vaulted",
  description: "Items and content that may not be listed, sold, traded, or offered on Get Vaulted.",
};

export default function ProhibitedItemsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
      <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
        ← Home
      </Link>
      <h1 className="font-display mt-6 text-2xl font-bold text-foreground">Prohibited Items Policy</h1>
      <p className="mt-2 text-xs text-zinc-500">Last updated: July 3, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-300">
        <section className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Owner / legal review recommended</p>
          <p className="mt-2 text-muted">
            This list reflects common marketplace prohibited-item standards and is a starting point, not a final,
            attorney-reviewed policy. Some categories (e.g., firearms components, certain memorabilia with
            right-of-publicity concerns, or jurisdiction-specific restricted goods) may need refinement for your
            specific catalog and target states before this is treated as binding policy.
          </p>
        </section>

        <section>
          <p className="text-muted">
            This Prohibited Items Policy applies to all listings, live-show offerings, box breaks, trades, and any
            other content offered for sale on Get Vaulted. It supplements (and does not replace) our{" "}
            <Link href="/terms" className="font-medium text-gold-bright hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/community-guidelines" className="font-medium text-gold-bright hover:underline">
              Community Guidelines
            </Link>
            . Listing a prohibited item may result in listing removal, order cancellation, payout holds, account
            suspension, or law-enforcement referral.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">1. Counterfeit, replica, and unauthorized items</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Counterfeit, replica, or bootleg trading cards, memorabilia, apparel, or accessories;</li>
            <li>Items misrepresented as game-used, autographed, or authenticated when they are not;</li>
            <li>Reprints, reprints of graded slabs, or altered/re-holdered slabs misrepresented as original;</li>
            <li>Items that infringe a third party&apos;s copyright, trademark, or right of publicity (see our{" "}
              <Link href="/dmca" className="font-medium text-gold-bright hover:underline">
                Copyright / DMCA Policy
              </Link>
              ).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">2. Weapons and hazardous items</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Firearms, firearm receivers/frames, ammunition, and explosive devices;</li>
            <li>Knives or bladed weapons restricted by shipping carriers or destination law;</li>
            <li>Hazardous, flammable, corrosive, or radioactive materials not permitted for standard carrier shipment.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">3. Illegal, regulated, or age-restricted goods</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Illegal drugs, drug paraphernalia, and controlled substances;</li>
            <li>Alcohol, tobacco, vaping, or cannabis products;</li>
            <li>Prescription medication or medical devices;</li>
            <li>Live animals, animal parts from protected/endangered species, or items violating wildlife trade law;</li>
            <li>Items requiring a license or permit you do not hold (e.g., certain coins, currency, or precious metals subject to dealer licensing).</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">4. Stolen, recalled, or unsafe goods</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Stolen property or items you do not have the right to sell;</li>
            <li>Items subject to an active government recall;</li>
            <li>Items that pose an unreasonable safety risk to buyers.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">5. Sexual content and content harming minors</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Sexually explicit content or adult material;</li>
            <li>
              Any content that sexualizes, endangers, or exploits minors — zero tolerance, immediate account
              termination, and referral to the National Center for Missing &amp; Exploited Children (NCMEC) and/or law
              enforcement.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">6. Fraud, hate, and other prohibited conduct</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Listings intended to launder money, evade platform fees, or facilitate off-platform payment fraud;</li>
            <li>Items or content promoting hate speech, terrorism, or violent extremism;</li>
            <li>Malware, hacking tools, or access to compromised accounts/services;</li>
            <li>Gift cards, digital currency, or financial instruments obtained fraudulently.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">7. Reporting a prohibited listing</h2>
          <p className="mt-3 text-muted">
            If you see a listing, live show, or trade offer that you believe violates this policy, use the in-app
            report tool (report reasons include &quot;Counterfeit / fake item&quot; and others) described on our{" "}
            <Link href="/reporting-safety" className="font-medium text-gold-bright hover:underline">
              Reporting &amp; Safety
            </Link>{" "}
            page, or email{" "}
            <a href="mailto:support@shopgetvaulted.com" className="font-medium text-gold-bright hover:underline">
              support@shopgetvaulted.com
            </a>
            . For copyright-specific claims, see our{" "}
            <Link href="/dmca" className="font-medium text-gold-bright hover:underline">
              Copyright / DMCA Policy
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">8. Changes to this policy</h2>
          <p className="mt-3 text-muted">
            We may update this policy as our catalog, jurisdictions, or legal obligations change. Continued listing or
            selling on Get Vaulted after an update means you accept the revised policy.
          </p>
        </section>
      </div>
    </main>
  );
}
