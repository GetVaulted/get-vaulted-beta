import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Get Vaulted",
  description: "Terms of service for the Get Vaulted marketplace, app, and related services.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
      <Link href="/signup" className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
        ← Back to Join
      </Link>
      <h1 className="font-display mt-6 text-2xl font-bold text-foreground">Terms of Service</h1>
      <p className="mt-2 text-xs text-zinc-500">Last updated: May 10, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-300">
        <section>
          <p className="text-muted">
            By accessing or using Get Vaulted, you agree to these Terms of Service. If you do not agree, do not use the
            platform.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">1. Platform Role</h2>
          <p className="mt-3 text-muted">
            Get Vaulted LLC operates a marketplace, app, website, and related services that allow users to buy, sell,
            list, share, message, livestream, and participate in transactions. Get Vaulted is a platform provider only
            unless we expressly state otherwise. We are not the seller, buyer, broker, auctioneer, insurer, appraiser,
            authenticator, custodian, or shipper of user-listed items.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">2. Eligibility</h2>
          <p className="mt-3 text-muted">
            You must be at least 18 years old to use the platform unless we expressly allow otherwise and the use is
            lawful. You represent that:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>you have legal capacity to enter these Terms;</li>
            <li>your registration information is accurate;</li>
            <li>you will keep it current;</li>
            <li>you are not barred from using the platform by law.</li>
          </ul>
          <p className="mt-3 text-muted">
            We may require identity verification, tax information, or other documentation before allowing certain
            features, including selling, payouts, high-value activity, or livestream participation.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">3. Accounts and Security</h2>
          <p className="mt-3 text-muted">
            You are responsible for your account credentials and all activity under your account. You must immediately
            notify us of suspected unauthorized use. We may require multi-factor authentication, identity verification,
            device checks, or additional security steps.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">4. Marketplace Transactions</h2>
          <p className="mt-3 text-muted">
            You are entering into transactions directly with other users, not with Get Vaulted, unless we clearly say
            otherwise. You are responsible for reviewing listings before purchase.
          </p>
          <p className="mt-3 text-muted">
            You acknowledge that collectibles, cards, memorabilia, watches, luxury items, and similar goods may have
            subjective grading, condition, provenance, and market value. We do not guarantee investment value, resale
            value, appreciation, rarity, or future demand.
          </p>
        </section>

        <section id="seller-obligations">
          <h2 className="font-display text-lg font-semibold text-foreground">5. Seller Responsibility</h2>
          <p className="mt-3 text-muted">Sellers are solely responsible for:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>authenticity of items;</li>
            <li>accurate descriptions and photos;</li>
            <li>legality of items;</li>
            <li>shipping on time;</li>
            <li>packaging and delivery;</li>
            <li>disclosures of defects, alterations, restoration, or damage;</li>
            <li>compliance with all laws and platform rules.</li>
          </ul>
          <p className="mt-3 text-muted">Counterfeit, stolen, infringing, or misleading items are prohibited.</p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">6. Buyer Responsibility</h2>
          <p className="mt-3 text-muted">Buyers are responsible for:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>reviewing item descriptions;</li>
            <li>paying promptly;</li>
            <li>providing accurate shipping information;</li>
            <li>inspecting items upon receipt;</li>
            <li>reporting issues within required timeframes;</li>
            <li>not abusing chargebacks or disputes.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            7. Livestreams, Live Selling, and Box Breaks
          </h2>
          <p className="mt-3 text-muted">
            Get Vaulted may offer livestream selling, live auctions, box breaks, live offers, and related features. You
            agree that:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>livestreams may be delayed, clipped, recorded, moderated, or shared;</li>
            <li>box breaks and live breaks involve disclosed formats and risk;</li>
            <li>no specific outcome or value is guaranteed;</li>
            <li>
              participants assume the risk of low-value or no-hit results unless expressly stated otherwise;
            </li>
            <li>the host’s published break rules govern the event.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">8. User Content and License</h2>
          <p className="mt-3 text-muted">
            You may upload, post, stream, message, comment, share, or otherwise submit content (“User Content”). You
            grant Get Vaulted a worldwide, non-exclusive, royalty-free, transferable, sublicensable license to use,
            host, store, reproduce, modify, adapt, publish, distribute, display, perform, and create derivative works
            from your User Content for operating, improving, moderating, promoting, and securing the platform.
          </p>
          <p className="mt-3 text-muted">
            This includes marketplace listings, social features, clips, “Hit Clip” content, promotional use, and
            fraud/security review.
          </p>
          <p className="mt-3 text-muted">
            You represent that you have all rights necessary to submit the content and grant this license.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">9. IP Rights</h2>
          <p className="mt-3 text-muted">
            All Get Vaulted software, branding, logos, text, design, and platform content are owned by or licensed to
            Get Vaulted. You may not copy, scrape, reverse engineer, resell, or exploit the platform except as expressly
            permitted by law or by us in writing.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">10. Prohibited Conduct</h2>
          <p className="mt-3 text-muted">You may not:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>sell counterfeit, stolen, illegal, or infringing items;</li>
            <li>commit fraud, identity abuse, laundering, or deceptive conduct;</li>
            <li>manipulate bids, reviews, listings, ratings, or clips;</li>
            <li>use bots, scrapers, or unauthorized automation;</li>
            <li>harass, threaten, exploit, or defraud users;</li>
            <li>interfere with the platform or livestreams;</li>
            <li>abuse chargebacks, refunds, disputes, promotions, or giveaways;</li>
            <li>create fake accounts or evade enforcement.</li>
          </ul>
        </section>

        <section id="payments-stripe-connect">
          <h2 className="font-display text-lg font-semibold text-foreground">11. Payments, Fees, and Payouts</h2>
          <p className="mt-3 text-muted">
            You authorize us and our payment providers to process charges, refunds, reversals, payouts, and
            adjustments.
          </p>
          <p className="mt-3 text-muted">We may charge:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>commissions;</li>
            <li>platform fees;</li>
            <li>listing fees;</li>
            <li>subscription fees;</li>
            <li>promotional fees;</li>
            <li>payment processing fees;</li>
            <li>dispute or chargeback-related fees, where allowed.</li>
          </ul>
          <p className="mt-3 text-muted">We may hold, delay, reverse, offset, or withhold payouts for:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>fraud review;</li>
            <li>chargebacks;</li>
            <li>shipping issues;</li>
            <li>policy violations;</li>
            <li>identity verification;</li>
            <li>compliance checks;</li>
            <li>reserve requirements;</li>
            <li>risk review;</li>
            <li>suspected abuse.</li>
          </ul>
          <p className="mt-3 text-muted">
            You are responsible for taxes, chargebacks, fines, penalties, and processor assessments tied to your
            activity.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">12. Chargebacks and Fraud Prevention</h2>
          <p className="mt-3 text-muted">
            Fraudulent chargebacks, false “item not received” claims, and other abuse are prohibited. We may
            investigate, suspend accounts, withhold funds, provide records to payment processors or law enforcement,
            and recover losses.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">13. Shipping and Risk</h2>
          <p className="mt-3 text-muted">
            Sellers must ship items safely and on time. Buyers must provide accurate delivery information. Risk of
            loss, title transfer, and delivery responsibility may depend on the listing terms, carrier confirmation,
            and applicable law. We are not liable for carrier delays, loss after delivery, weather, theft, address
            errors, or packaging failures except as required by law.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">14. Third-Party Services</h2>
          <p className="mt-3 text-muted">
            Get Vaulted uses third-party services including, without limitation, Stripe, Netlify, Supabase, Resend, AWS
            IVS, and other providers we may use now or later for payments, hosting, authentication, storage, email,
            analytics, livestreaming, fraud prevention, and infrastructure.
          </p>
          <p className="mt-3 text-muted">You agree that:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>third-party services may process, store, or transmit your data;</li>
            <li>their own terms and privacy policies may apply;</li>
            <li>service availability may depend on those providers;</li>
            <li>we may add, remove, or replace providers at any time;</li>
            <li>
              we are not responsible for provider outages, errors, data loss, delays, or security incidents except
              where prohibited by law.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">15. Disclaimers</h2>
          <p className="mt-3 text-muted">
            THE PLATFORM IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, GET VAULTED
            DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
            TITLE, AND NON-INFRINGEMENT.
          </p>
          <p className="mt-3 text-muted">We do not guarantee:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>uninterrupted or error-free service;</li>
            <li>accuracy of listings or content;</li>
            <li>authenticity of user-listed items;</li>
            <li>success of transactions;</li>
            <li>delivery outcomes;</li>
            <li>investment or collectible value;</li>
            <li>AI output accuracy, if AI tools are used.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">16. Limitation of Liability</h2>
          <p className="mt-3 text-muted">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, GET VAULTED AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES,
            AGENTS, AND SERVICE PROVIDERS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
            EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST DATA, LOST GOODWILL, BUSINESS INTERRUPTION, OR
            SUBSTITUTE SERVICE COSTS.
          </p>
          <p className="mt-3 text-muted">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY CLAIM WILL NOT EXCEED THE GREATER OF:
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted">
            <li>
              THE AMOUNT YOU PAID TO GET VAULTED IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM; OR
            </li>
            <li>$100 USD.</li>
          </ol>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">17. Indemnification</h2>
          <p className="mt-3 text-muted">
            You agree to defend, indemnify, and hold harmless Get Vaulted from claims, damages, losses, liabilities,
            and expenses arising from your use of the platform, your content, your listings, your transactions, your
            violation of law or policy, or your infringement of third-party rights.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            18. Arbitration and Class Action Waiver
          </h2>
          <p className="mt-3 text-muted">
            Except where prohibited by law, any dispute arising out of or relating to these Terms or the platform will
            be resolved by binding individual arbitration in Texas. You and Get Vaulted waive any right to class
            actions, class arbitration, or representative proceedings.
          </p>
          <p className="mt-3 text-muted">
            Small claims court or injunctive relief may be available where allowed by law. This section survives
            termination.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">19. Governing Law</h2>
          <p className="mt-3 text-muted">
            These Terms are governed by the laws of the State of Texas, without regard to conflict of laws rules.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">20. Updates</h2>
          <p className="mt-3 text-muted">
            We may update these Terms at any time. The revised version is effective when posted unless stated
            otherwise. Continued use means acceptance.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">21. Suspension and Termination</h2>
          <p className="mt-3 text-muted">
            We may suspend, restrict, or terminate accounts, listings, messages, payouts, or access at any time, with
            or without notice, if we believe you violated these Terms, our policies, applicable law, or the rights of
            others, or if we believe your account presents risk, fraud, or compliance concerns.
          </p>
        </section>

        <section id="contact">
          <h2 className="font-display text-lg font-semibold text-foreground">22. Contact</h2>
          <address className="mt-3 not-italic text-muted">
            Get Vaulted LLC
            <br />
            <a
              href="mailto:support@shopgetvaulted.com"
              className="font-medium text-gold-bright hover:underline"
            >
              support@shopgetvaulted.com
            </a>
            <br />
            <a href="tel:+19037013900" className="font-medium text-gold-bright hover:underline">
              903-701-3900
            </a>
          </address>
        </section>
      </div>
    </main>
  );
}
