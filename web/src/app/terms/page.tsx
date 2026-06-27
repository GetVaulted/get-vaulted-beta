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
      <p className="mt-2 text-xs text-zinc-500">Last updated: June 26, 2026</p>

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
            Get Vaulted LLC (“Get Vaulted,” “we,” “us”) operates a collector marketplace, mobile application, website,
            and related services that allow users to buy, sell, list, offer, bid, trade, message, livestream, and
            complete transactions. Features include The Vault marketplace (Buy Now, auctions, offers, and layaway on
            eligible listings), Vault Events and live commerce (auctions, fixed-price drops, box breaks including Pick
            Your Team / Pick Your Division and random spots, and giveaways where offered), Trade Center (vault-to-vault
            trade offers), Vault Wallet (saved payment and shipping for checkout), seller fulfillment tools (including
            integrated shipping labels), and community trust features (ratings, reporting, and moderation).
          </p>
          <p className="mt-3 text-muted">
            Get Vaulted is a platform provider only unless we expressly state otherwise. We are not the seller, buyer,
            broker, auctioneer, insurer, appraiser, authenticator, custodian, or shipper of user-listed items.
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
            You are responsible for your account credentials and all activity under your account. You may sign in with
            email and password or, where enabled, third-party identity providers such as Apple or Google through our
            authentication partner (Supabase Auth). You must immediately notify us of suspected unauthorized use. We may
            require multi-factor authentication, identity verification, device checks, or additional security steps.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">4. Marketplace Transactions</h2>
          <p className="mt-3 text-muted">
            You are entering into transactions directly with other users, not with Get Vaulted, unless we clearly say
            otherwise. You are responsible for reviewing listings, break rules, shipping terms, and seller information
            before you buy, bid, offer, trade, or claim a spot.
          </p>
          <p className="mt-3 text-muted">
            Marketplace listings may support Buy Now checkout, timed auctions, buyer offers, trade offers, and layaway on
            eligible items. Layaway terms (including non-refundable deposits and payment schedules) are shown at checkout
            and must be accepted before a layaway begins. Items reserved on layaway are not shipped until paid in full
            unless we state otherwise in writing.
          </p>
          <p className="mt-3 text-muted">
            You acknowledge that collectibles, cards, memorabilia, watches, luxury items, and similar goods may have
            subjective grading, condition, provenance, and market value. We do not guarantee investment value, resale
            value, appreciation, rarity, or future demand.
          </p>
        </section>

        <section id="seller-obligations">
          <h2 className="font-display text-lg font-semibold text-foreground">5. Seller Responsibility</h2>
          <p className="mt-3 text-muted">
            If you list, sell, host live shows, or fulfill orders on Get Vaulted, you act as an independent seller — not
            as an employee, agent, or partner of Get Vaulted. You are solely responsible for your inventory, listings,
            conduct, compliance, and fulfillment. These obligations apply to marketplace sales, live commerce, layaway
            sales, trade-related shipments, and any other seller activity on the Platform.
          </p>

          <h3 className="mt-6 font-semibold text-zinc-100">5.1 Seller eligibility and setup</h3>
          <p className="mt-2 text-muted">Before selling or going live, you must:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>complete seller setup and any identity or compliance steps we require;</li>
            <li>
              connect an active Stripe Connect account and keep payout details, tax information, and verification current
              — payouts may be blocked if Stripe flags your account;
            </li>
            <li>
              maintain a complete, verified ship-from address used for labels and shipping quotes (invalid or incomplete
              addresses cause label failures and harm buyers);
            </li>
            <li>provide accurate business and contact information and update it when it changes;</li>
            <li>
              meet all readiness checks shown in Seller HQ or seller tools before publishing listings or hosting Vault
              Events (including shipping configuration where required).
            </li>
          </ul>
          <p className="mt-2 text-muted">
            We may deny, suspend, or revoke selling privileges at any time for incomplete setup, failed verification, policy
            violations, or risk concerns.
          </p>

          <h3 className="mt-6 font-semibold text-zinc-100">5.2 Listing accuracy and authenticity</h3>
          <p className="mt-2 text-muted">For every listing and live lot, you must:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>
              describe items truthfully — including condition, flaws, alterations, restoration, damage, quantity, and
              included accessories;
            </li>
            <li>
              use clear, current photos and video that show the actual item sold (not stock photos or misleading edits);
            </li>
            <li>
              represent grading, authentication, or “Vault Verified” status only when accurate and authorized — slab
              serials, grader labels, and certification claims must match the item shipped;
            </li>
            <li>
              disclose break formats, spot types (Pick Your Team, Pick Your Division, random assignments, Cards vs
              Helmets, etc.), pricing, and rules before buyers purchase;
            </li>
            <li>
              set honest handling times, shipping methods, and parcel weight/size used for rate quotes — incorrect
              weights or dimensions may invalidate quotes and labels;
            </li>
            <li>honor the price, format, and terms shown when the buyer purchases (auction, Buy Now, offer, or live drop).</li>
          </ul>
          <p className="mt-2 text-muted">
            Counterfeit, stolen, misrepresented, infringing, or illegal items are strictly prohibited. You are solely
            liable for authenticity and description claims.
          </p>

          <h3 className="mt-6 font-semibold text-zinc-100">5.3 Legal compliance</h3>
          <p className="mt-2 text-muted">You are responsible for compliance with all applicable laws, including:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>consumer protection and distance-selling rules in your jurisdiction;</li>
            <li>sales, income, and other tax obligations on your sales (Stripe Tax may collect buyer sales tax where configured — you remain responsible for your own tax filings);</li>
            <li>export, import, and sanctions restrictions;</li>
            <li>rules governing collectibles, memorabilia, regulated goods, and intellectual property;</li>
            <li>our Terms, Community Guidelines, and in-product seller policies.</li>
          </ul>

          <h3 className="mt-6 font-semibold text-zinc-100">5.4 Fulfillment and shipping</h3>
          <p className="mt-2 text-muted">When you receive a paid order (marketplace, live, or otherwise), you must:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>ship within the handling time stated on the listing or order unless a longer window was clearly disclosed;</li>
            <li>
              ship the correct item in the condition described — substitutions, downgrades, or “similar items” require
              buyer consent;
            </li>
            <li>
              use Get Vaulted integrated label and tracking flows when provided or required — shipping outside the
              platform to evade fees, protections, or monitoring is prohibited;
            </li>
            <li>package items securely for collectibles (appropriate protection, sealing, and carrier-appropriate materials);</li>
            <li>purchase and attach labels promptly; ensure tracking scans and updates reach the buyer through the Platform;</li>
            <li>
              maintain a valid ship-from address — label purchase may fail if your origin address is incomplete or
              unverified;
            </li>
            <li>
              <strong className="text-zinc-200">not ship layaway orders until paid in full</strong> — layaway listings
              reserve inventory until the buyer completes all payments;
            </li>
            <li>resolve carrier exceptions (failed labels, bad addresses) quickly and cooperate with buyer support if stuck.</li>
          </ul>
          <p className="mt-2 text-muted">
            Repeated late shipments, non-shipment, or shipping exceptions may result in refunds, chargebacks, payout holds,
            listing removal, or account suspension.
          </p>

          <h3 className="mt-6 font-semibold text-zinc-100">5.5 Live selling and Vault Events</h3>
          <p className="mt-2 text-muted">If you host live shows or breaks, you additionally agree to:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>run shows in good faith — honor sold spots, winning bids, and Buy Now purchases;</li>
            <li>clearly state break rules, spot prices, randomization method, and what is included before selling;</li>
            <li>not mislead buyers about odds, contents, hits, or product type (Cards vs Helmets, etc.);</li>
            <li>moderate your room and comply with chat, conduct, and safety rules;</li>
            <li>
              fulfill live sales with the same care as marketplace orders, including timely label creation and shipment;
            </li>
            <li>
              honor giveaways and promotions run in your room according to in-product rules and claim windows;
            </li>
            <li>
              understand that livestreams may be recorded or clipped for moderation, disputes, and platform safety.
            </li>
          </ul>

          <h3 className="mt-6 font-semibold text-zinc-100">5.6 Offers, auctions, layaway, and trades</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>respond to buyer offers in good faith when offers are enabled;</li>
            <li>ship auction wins after payment clears and within your stated handling time;</li>
            <li>
              honor layaway reservations — do not sell reserved inventory to another buyer or ship early; layaway deposits
              are governed by checkout terms shown to buyers;
            </li>
            <li>
              if you participate in Trade Center, ship accepted trades on time using platform label flows and accurate
              item descriptions.
            </li>
          </ul>

          <h3 className="mt-6 font-semibold text-zinc-100">5.7 Customer service, refunds, and disputes</h3>
          <p className="mt-2 text-muted">You must:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>respond to buyer order messages and refund requests promptly and professionally;</li>
            <li>cooperate with Get Vaulted dispute, refund, and chargeback investigations — provide tracking, photos, and truthful explanations when asked;</li>
            <li>not ask buyers to cancel orders, pay off-platform, or bypass Platform checkout or protections;</li>
            <li>accept that we may issue refunds, reverse payouts, or resolve disputes per Platform policies and payment network rules, even if you disagree.</li>
          </ul>

          <h3 className="mt-6 font-semibold text-zinc-100">5.8 Fees, payouts, and reserves</h3>
          <p className="mt-2 text-muted">
            You authorize platform fees, payment processing costs, trade fees, and adjustments disclosed at listing,
            checkout, or in seller tools. Payouts are processed through Stripe Connect and may be delayed, held, or
            offset for fraud review, chargebacks, shipping failures, escrow or delivery confirmation requirements,
            identity verification, reserves, or policy violations. You are responsible for chargebacks, processor fines,
            and negative balances associated with your sales.
          </p>

          <h3 className="mt-6 font-semibold text-zinc-100">5.9 Prohibited seller conduct</h3>
          <p className="mt-2 text-muted">Without limitation, sellers may not:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>shill bid, manipulate auctions, or create fake demand;</li>
            <li>harass buyers or other sellers in chat, DMs, or live rooms;</li>
            <li>retaliate against buyers who leave honest reviews or open disputes;</li>
            <li>list items they do not possess or cannot ship within a reasonable time;</li>
            <li>use multiple accounts to evade enforcement, fees, or restrictions;</li>
            <li>scrape buyer data or solicit off-platform transactions using information obtained on Get Vaulted.</li>
          </ul>

          <h3 className="mt-6 font-semibold text-zinc-100">5.10 Enforcement</h3>
          <p className="mt-2 text-muted">
            Violations may result in listing removal, live ban, payout hold, reserve increases, refund issuance, account
            suspension, or permanent termination. Serious or repeated violations may be referred to payment partners,
            carriers, or law enforcement. Get Vaulted may act to protect buyers and the marketplace even if that means
            reversing a sale or restricting your account pending investigation.
          </p>
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
            Get Vaulted may offer livestream selling, live auctions, box breaks (including Pick Your Team, Pick Your
            Division, random team/division assignments, Cards/Helmets break formats, and related spot commerce), live
            Buy Now drops, live giveaways, and related features. You agree that:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>livestreams may be delayed, clipped, recorded, moderated, or shared;</li>
            <li>live video may be delivered through third-party streaming infrastructure (including Amazon IVS);</li>
            <li>hosts may stream from mobile or external broadcast software (such as OBS) subject to platform rules;</li>
            <li>box breaks and live breaks involve disclosed formats and risk;</li>
            <li>no specific outcome, hit, or value is guaranteed;</li>
            <li>
              participants assume the risk of low-value or no-hit results unless expressly stated otherwise;
            </li>
            <li>the host’s published break rules and in-room instructions govern the event;</li>
            <li>live purchases may require a ready Vault Wallet (payment method and shipping address on file);</li>
            <li>giveaway entry and prize claim rules shown in-product apply and may require presence in-room.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">8. Trades</h2>
          <p className="mt-3 text-muted">
            Trade Center allows users to propose vault-to-vault trades, including optional cash adjustments and platform
            trade fees based on disclosed weight tiers. Trades are agreements between users. You must accurately describe
            traded items, honor accepted trades, ship within stated windows using platform label flows when provided, and
            not attempt to complete trades off-platform to evade fees or protections. Active trades may restrict account
            deletion or certain account changes until resolved.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">9. User Content and License</h2>
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
          <h2 className="font-display text-lg font-semibold text-foreground">10. IP Rights</h2>
          <p className="mt-3 text-muted">
            All Get Vaulted software, branding, logos, text, design, and platform content are owned by or licensed to
            Get Vaulted. You may not copy, scrape, reverse engineer, resell, or exploit the platform except as expressly
            permitted by law or by us in writing.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">11. Prohibited Conduct</h2>
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
          <h2 className="font-display text-lg font-semibold text-foreground">12. Payments, Fees, and Payouts</h2>
          <p className="mt-3 text-muted">
            You authorize us and our payment processors (principally Stripe) to process charges, refunds, reversals,
            payouts, tax collection where enabled, and adjustments. Seller payouts are made through Stripe Connect to
            your linked bank account subject to Stripe’s terms and identity verification.
          </p>
          <p className="mt-3 text-muted">
            Buyers may pay by card and, where enabled, digital wallets such as Apple Pay, Google Pay, Link, or other
            methods shown at checkout or in Vault Wallet. Saved payment methods may be charged for live wins, Buy Now
            purchases, and other wallet checkout flows you initiate.
          </p>
          <p className="mt-3 text-muted">We may charge:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>commissions;</li>
            <li>platform fees;</li>
            <li>listing fees;</li>
            <li>subscription fees;</li>
            <li>promotional fees;</li>
            <li>payment processing fees;</li>
            <li>trade fees;</li>
            <li>dispute or chargeback-related fees, where allowed.</li>
          </ul>
          <p className="mt-3 text-muted">
            Sales tax may be calculated and collected through Stripe Tax where enabled and where we have applicable tax
            nexus. Tax amounts shown at checkout are estimates until finalized by the processor.
          </p>
          <p className="mt-3 text-muted">
            High-value or protected transactions may use extended payout holds, escrow-style release, or alternate
            checkout paths when disclosed at checkout (“Vaulted Secure Checkout” or similar). Funds may remain pending
            until delivery confirmation or other release conditions are met.
          </p>
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
          <h2 className="font-display text-lg font-semibold text-foreground">13. Chargebacks and Fraud Prevention</h2>
          <p className="mt-3 text-muted">
            Fraudulent chargebacks, false “item not received” claims, and other abuse are prohibited. We may
            investigate, suspend accounts, withhold funds, provide records to payment processors or law enforcement,
            and recover losses.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">14. Shipping and Risk</h2>
          <p className="mt-3 text-muted">
            Sellers must ship items safely and on time using platform-integrated label tools when provided. Buyers must
            provide accurate, deliverable shipping addresses. We may validate or normalize addresses through Shippo (or
            similar providers) before labels are purchased. Shipping rate quotes at listing or checkout may come from
            Shippo and underlying carriers (such as USPS, UPS, and FedEx); final rates depend on package details and
            service selected.
          </p>
          <p className="mt-3 text-muted">
            Risk of loss, title transfer, and delivery responsibility may depend on the listing terms, carrier
            confirmation, and applicable law. We are not liable for carrier delays, loss after delivery, weather, theft,
            address errors, or packaging failures except as required by law.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">15. Third-Party Services</h2>
          <p className="mt-3 text-muted">
            Get Vaulted relies on third-party providers to operate the platform. Current categories include:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>
              <strong className="text-zinc-200">Stripe</strong> — payment processing, Stripe Connect seller payouts,
              Stripe Tax, saved payment methods, checkout, and related financial services;
            </li>
            <li>
              <strong className="text-zinc-200">Shippo</strong> — shipping labels, carrier rate quotes, address
              validation and autocomplete, and tracking updates (carriers such as USPS, UPS, and FedEx are accessed
              through Shippo, not directly by Get Vaulted);
            </li>
            <li>
              <strong className="text-zinc-200">Supabase</strong> — user authentication (including Apple and Google sign-in
              where enabled), PostgreSQL database, file storage, and Realtime features;
            </li>
            <li>
              <strong className="text-zinc-200">Netlify</strong> — web hosting, deployment, and serverless functions;
            </li>
            <li>
              <strong className="text-zinc-200">Resend</strong> — transactional and verification email;
            </li>
            <li>
              <strong className="text-zinc-200">Amazon Web Services (AWS)</strong> — including Amazon Interactive Video
              Service (IVS) for live video ingest, playback, and related streaming infrastructure; hosts may use OBS or
              similar broadcast software with IVS;
            </li>
            <li>
              <strong className="text-zinc-200">Expo</strong> — delivery of mobile push notifications to registered
              devices;
            </li>
            <li>
              <strong className="text-zinc-200">Apple and Google</strong> — identity services when you choose Sign in with
              Apple or Google Sign-In;
            </li>
            <li>
              optional infrastructure we may enable from time to time, such as Redis, Apache Kafka, OpenTelemetry
              collectors, or alternate escrow/payment partners when explicitly disclosed in-product.
            </li>
          </ul>
          <p className="mt-3 text-muted">
            Your use of certain features may also be subject to the Apple App Store, Google Play, Stripe, Shippo,
            Supabase, or other provider terms in addition to these Terms.
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
          <h2 className="font-display text-lg font-semibold text-foreground">16. Disclaimers</h2>
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
          <h2 className="font-display text-lg font-semibold text-foreground">17. Limitation of Liability</h2>
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
          <h2 className="font-display text-lg font-semibold text-foreground">18. Indemnification</h2>
          <p className="mt-3 text-muted">
            You agree to defend, indemnify, and hold harmless Get Vaulted from claims, damages, losses, liabilities,
            and expenses arising from your use of the platform, your content, your listings, your transactions, your
            violation of law or policy, or your infringement of third-party rights.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            19. Arbitration and Class Action Waiver
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
          <h2 className="font-display text-lg font-semibold text-foreground">20. Governing Law</h2>
          <p className="mt-3 text-muted">
            These Terms are governed by the laws of the State of Texas, without regard to conflict of laws rules.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">21. Updates</h2>
          <p className="mt-3 text-muted">
            We may update these Terms at any time. The revised version is effective when posted unless stated
            otherwise. Continued use means acceptance.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">22. Suspension and Termination</h2>
          <p className="mt-3 text-muted">
            We may suspend, restrict, or terminate accounts, listings, messages, payouts, or access at any time, with
            or without notice, if we believe you violated these Terms, our policies, applicable law, or the rights of
            others, or if we believe your account presents risk, fraud, or compliance concerns.
          </p>
        </section>

        <section id="contact">
          <h2 className="font-display text-lg font-semibold text-foreground">23. Contact</h2>
          <address className="mt-3 not-italic text-muted">
            Get Vaulted LLC
            <br />
            <a
              href="mailto:support@shopgetvaulted.com"
              className="font-medium text-gold-bright hover:underline"
            >
              support@shopgetvaulted.com
            </a>
          </address>
        </section>
      </div>
    </main>
  );
}
