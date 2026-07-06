import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Community Guidelines — Get Vaulted",
  description:
    "Community standards for buying, selling, livestreams, trades, and messaging on Get Vaulted.",
};

export default function CommunityGuidelinesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
      <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
        ← Home
      </Link>
      <h1 className="font-display mt-6 text-2xl font-bold text-foreground">Community Guidelines</h1>
      <p className="mt-2 text-xs text-zinc-500">Last updated: July 3, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-300">
        <section>
          <p className="text-muted">
            Get Vaulted is built for collectors who want fair markets, transparent live selling, and respectful
            communities. These Community Guidelines apply to everyone on the Platform — buyers, sellers, hosts,
            moderators, and guests — across The Vault marketplace, Vault Events, live chat, Trade Center, messages, and
            profiles.
          </p>
          <p className="mt-3 text-muted">
            These guidelines work together with our{" "}
            <Link href="/terms" className="font-semibold text-gold-bright hover:underline">
              Terms of Service
            </Link>
            . When behavior violates both, we may enforce under either or both. If something isn&apos;t listed here, use
            common sense: treat others fairly and follow the law.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">1. Be respectful</h2>
          <p className="mt-3 text-muted">Treat other collectors, sellers, and staff with respect. Do not:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>harass, bully, threaten, or intimidate other users;</li>
            <li>use slurs, hate speech, or discriminate based on protected characteristics;</li>
            <li>dox or publish private personal information without consent;</li>
            <li>sexually harass others or send unwanted sexual content;</li>
            <li>encourage violence or self-harm;</li>
            <li>spam, flood chat, brigade, or artificially inflate followers, views, or engagement;</li>
            <li>impersonate Get Vaulted staff, other users, celebrities, or brands.</li>
          </ul>
          <p className="mt-3 text-muted">
            Live chat, order messages, profiles, and public comments are visible to others — keep conversations
            appropriate for a public marketplace.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">2. Buy honestly</h2>
          <p className="mt-3 text-muted">As a buyer, you agree to:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>read listings, break rules, and shipping terms before you purchase or bid;</li>
            <li>bid and buy only when you intend to pay — keep your Vault Wallet ready in live rooms;</li>
            <li>pay promptly when you win an auction or claim a spot;</li>
            <li>provide accurate shipping addresses and update your wallet when needed;</li>
            <li>inspect items on delivery and raise legitimate issues through refunds or disputes — not chargeback abuse;</li>
            <li>not collude to manipulate prices, shill bid, or harass sellers over honest reviews;</li>
            <li>not request off-platform payment to avoid fees or buyer protections.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">3. Sell and list honestly</h2>
          <p className="mt-3 text-muted">As a seller, you must:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>sell only authentic, legal items you have the right to sell;</li>
            <li>use accurate photos, titles, descriptions, condition grades, and quantity;</li>
            <li>disclose damage, alterations, restoration, reholders, and known flaws;</li>
            <li>
              represent grading, slab serials, and Vault Verified / authentication claims honestly — do not sell
              counterfeits or mislabeled slabs;
            </li>
            <li>set honest handling times and ship within the timeframe you publish;</li>
            <li>use platform checkout and label flows — do not divert buyers off-platform;</li>
            <li>honor accepted offers, auction results, live sales, and layaway reservations;</li>
            <li>
              not ship layaway orders until paid in full unless Get Vaulted authorizes otherwise in writing.
            </li>
          </ul>
          <p className="mt-3 text-muted">
            Detailed seller requirements are in our{" "}
            <Link href="/terms#seller-obligations" className="font-semibold text-gold-bright hover:underline">
              Terms of Service (Seller Responsibility)
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">4. Live shows and box breaks</h2>
          <p className="mt-3 text-muted">Hosts and sellers running Vault Events must:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>
              clearly explain break format before selling — including Pick Your Team (PYT), Pick Your Division (PYD),
              random team/division spots, Cards vs Helmets categories, pricing, and what is included;
            </li>
            <li>not guarantee specific hits, grades, or financial outcomes unless expressly and truthfully disclosed;</li>
            <li>honor sold spots, winning bids, and Buy Now purchases from the live queue;</li>
            <li>run giveaways and promotions according to in-product rules and claim windows;</li>
            <li>moderate chat responsibly and follow platform safety tools;</li>
            <li>fulfill live sales with the same shipping and authenticity standards as marketplace orders;</li>
            <li>not mislead buyers about odds, product type, or fulfillment.</li>
          </ul>
          <p className="mt-3 text-muted">
            Breaks involve disclosed risk — buyers may receive low-value or no-hit results. That is not misconduct when
            rules were clear and honestly presented.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">5. Auctions and offers</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Do not shill bid, use fake accounts, or manipulate auction outcomes.</li>
            <li>Sellers must not cancel legitimate sales to avoid fees after a valid win.</li>
            <li>Offers and counters should be made in good faith — do not bait with offers you never intend to honor.</li>
            <li>Do not retract winning bids or refuse payment without valid platform process.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">6. Trades and layaway</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Describe traded items accurately and ship accepted trades on time using platform tools when provided.</li>
            <li>Do not complete trades off-platform to evade fees or protections.</li>
            <li>Honor layaway reservations — reserved inventory belongs to the layaway buyer until the plan ends.</li>
            <li>Layaway deposit terms shown at checkout apply; do not pressure buyers to cancel improperly.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">7. Payments and checkout</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>
              Complete purchases through Get Vaulted checkout, live wallet, and other payment flows we provide (Stripe,
              Apple Pay, Google Pay, etc. where enabled).
            </li>
            <li>
              Do not solicit or accept payment off-platform (PayPal, Venmo, Cash App, wire, crypto, etc.) unless Get
              Vaulted explicitly authorizes it in writing.
            </li>
            <li>Do not phish for login credentials, payment details, or personal data.</li>
            <li>Do not abuse refunds, chargebacks, or disputes in bad faith.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">8. Prohibited content and items</h2>
          <p className="mt-3 text-muted">
            The following are not allowed on Get Vaulted (see our full{" "}
            <Link href="/prohibited-items" className="font-semibold text-gold-bright hover:underline">
              Prohibited Items Policy
            </Link>{" "}
            for the complete list):
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>counterfeit, stolen, or knowingly misrepresented goods;</li>
            <li>
              items that infringe copyrights, trademarks, or publicity rights (see our{" "}
              <Link href="/dmca" className="font-semibold text-gold-bright hover:underline">
                Copyright / DMCA Policy
              </Link>
              );
            </li>
            <li>illegal drugs, weapons, explosives, or other regulated goods where sale is prohibited;</li>
            <li>sexually explicit content, especially involving minors (zero tolerance);</li>
            <li>hate symbols, glorification of violence, or content promoting illegal activity;</li>
            <li>malware, phishing links, or scams targeting users;</li>
            <li>listings or streams primarily designed to evade Platform rules or fees.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">9. Moderators and hosts</h2>
          <p className="mt-3 text-muted">
            Live hosts and assigned moderators may mute, timeout, remove users from a show, block bidding, or ban users
            from a seller&apos;s streams using in-product tools. These powers must be used fairly — not to silence
            legitimate criticism, retaliate against buyers, or discriminate. Abuse of moderation tools may result in
            loss of hosting or moderation privileges.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">10. Reviews and feedback</h2>
          <p className="mt-3 text-muted">
            Get Vaulted does not currently have a star-rating or written-review system on seller profiles or listings.
            If and when we introduce buyer reviews or feedback tools, they must be honest and based on a real
            transaction — fake reviews, review threats used to extort sellers, and retaliation against buyers who
            report legitimate problems are prohibited wherever such features exist.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">11. Enforcement</h2>
          <p className="mt-3 text-muted">
            When we believe these guidelines or our Terms were violated, we may take action including:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>warnings or educational notices;</li>
            <li>content removal or listing takedowns;</li>
            <li>chat mutes, live room bans, or seller stream bans;</li>
            <li>restrictions on bidding, buying, selling, or going live;</li>
            <li>payout holds or reserves;</li>
            <li>temporary or permanent account suspension;</li>
            <li>referral to payment partners, carriers, or law enforcement where appropriate.</li>
          </ul>
          <p className="mt-3 text-muted">
            Severity, history, and harm to buyers or the community affect outcomes. We are not required to provide advance
            notice in emergencies or clear fraud cases.
          </p>
        </section>

        <section id="appeals">
          <h2 className="font-display text-lg font-semibold text-foreground">12. Appeals</h2>
          <p className="mt-3 text-muted">
            If you believe a listing removal, content removal, or account restriction was made in error, you may
            request a review by emailing{" "}
            <a href="mailto:support@shopgetvaulted.com" className="font-semibold text-gold-bright hover:underline">
              support@shopgetvaulted.com
            </a>{" "}
            with your account email/username, the affected listing or order ID, and why you believe the action was
            incorrect. We review appeals on a case-by-case basis; submitting an appeal does not guarantee reversal,
            and some actions (including those involving fraud, safety, minors, or legal process) are final and not
            eligible for appeal.
          </p>
        </section>

        <section id="reporting">
          <h2 className="font-display text-lg font-semibold text-foreground">13. Reporting concerns</h2>
          <p className="mt-3 text-muted">
            If you see violations, report them in-app from profiles, listings, live rooms, chat messages, or orders. See
            our{" "}
            <Link href="/reporting-safety" className="font-semibold text-gold-bright hover:underline">
              Reporting &amp; Safety
            </Link>{" "}
            page for report reasons, step-by-step instructions, and urgent safety guidance.
          </p>
          <p className="mt-3 text-muted">
            Email{" "}
            <a href="mailto:support@shopgetvaulted.com" className="font-semibold text-gold-bright hover:underline">
              support@shopgetvaulted.com
            </a>{" "}
            if you cannot use in-app reporting. For immediate danger, contact local emergency services first.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Related policies</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>
              <Link href="/terms" className="font-semibold text-gold-bright hover:underline">
                Terms of Service
              </Link>
            </li>
            <li>
              <Link href="/terms#seller-obligations" className="font-semibold text-gold-bright hover:underline">
                Seller obligations (Terms §5)
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="font-semibold text-gold-bright hover:underline">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/prohibited-items" className="font-semibold text-gold-bright hover:underline">
                Prohibited Items Policy
              </Link>
            </li>
            <li>
              <Link href="/dmca" className="font-semibold text-gold-bright hover:underline">
                Copyright / DMCA Policy
              </Link>
            </li>
            <li>
              <Link href="/support" className="font-semibold text-gold-bright hover:underline">
                Help Center
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
