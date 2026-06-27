import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Get Vaulted",
  description: "How Get Vaulted LLC collects, uses, shares, and protects personal information.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
      <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
        ← Home
      </Link>
      <h1 className="font-display mt-6 text-2xl font-bold text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-xs text-zinc-500">Last updated: June 26, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-300">
        <section>
          <p className="text-muted">
            This Privacy Policy explains how Get Vaulted LLC (“Get Vaulted,” “we,” “us”) collects, uses, shares, and
            protects personal information when you use our website, mobile application, and related services (the
            “Platform”). The Platform includes The Vault marketplace, Vault Events and live commerce, Trade Center,
            Vault Wallet, seller tools, and community features.
          </p>
          <p className="mt-3 text-muted">
            By using the Platform, you agree to this Privacy Policy. If you do not agree, do not use the Platform.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">1. Information We Collect</h2>
          <p className="mt-3 text-muted">We may collect the following categories of information:</p>

          <p className="mt-4 font-medium text-zinc-200">Account and profile</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>name, username, email address, and password (stored via our authentication provider);</li>
            <li>
              identifiers from Sign in with Apple or Google Sign-In when you use those options (such as provider user
              IDs and email, subject to your provider settings);
            </li>
            <li>profile photo, bio, and public storefront information you choose to display;</li>
            <li>phone number only if you voluntarily provide it (for example on a shipping address or support request).</li>
          </ul>

          <p className="mt-4 font-medium text-zinc-200">Shipping and addresses</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>shipping and ship-from addresses, recipient names, and related delivery details;</li>
            <li>
              address validation and normalization results from Shippo when you save or verify an address (to reduce label
              failures).
            </li>
          </ul>

          <p className="mt-4 font-medium text-zinc-200">Payments and payouts</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>
              payment method metadata processed by Stripe (such as card brand, last four digits, expiration, billing
              ZIP, and Stripe customer or payment method IDs) — we do not store full card numbers on our servers;
            </li>
            <li>
              seller payout and identity information collected through Stripe Connect (bank account details, tax
              information, and verification documents as required by Stripe);
            </li>
            <li>transaction amounts, order IDs, refund/dispute status, layaway schedules, and trade fees;</li>
            <li>sales tax calculation inputs and results when Stripe Tax is enabled.</li>
          </ul>

          <p className="mt-4 font-medium text-zinc-200">Marketplace, live, and trade activity</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>listings, bids, offers, purchases, auctions, layaways, and live-room commerce (including break spots);</li>
            <li>trade offers, messages attached to trades, and trade shipping label data;</li>
            <li>order fulfillment, tracking numbers, and carrier status from Shippo or carriers;</li>
            <li>reviews, ratings, reports, disputes, and support tickets you submit;</li>
            <li>live chat messages, moderation actions, and live-room participation data;</li>
            <li>
              livestream-related metadata (for example stream status, viewer presence counts, and replay or clip data
              retained for moderation, disputes, or safety as configured).
            </li>
          </ul>

          <p className="mt-4 font-medium text-zinc-200">Content you upload</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>listing photos and videos, profile media, and other User Content;</li>
            <li>messages, comments, and communications sent through Platform features.</li>
          </ul>

          <p className="mt-4 font-medium text-zinc-200">Device, app, and technical data</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>IP address, browser type, device identifiers, operating system, and app version;</li>
            <li>push notification tokens registered with Expo when you enable mobile push alerts;</li>
            <li>log files, crash data, security signals, and usage events for fraud prevention and reliability;</li>
            <li>cookies, local storage, and similar technologies on the web (see Section 6).</li>
          </ul>

          <p className="mt-4 font-medium text-zinc-200">From third parties</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>payment status, chargeback, and payout data from Stripe;</li>
            <li>tracking and label events from Shippo and carriers;</li>
            <li>authentication and storage services from Supabase;</li>
            <li>information from fraud, identity, or compliance vendors when we use them.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">2. How We Use Information</h2>
          <p className="mt-3 text-muted">We use information to:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>create and manage accounts, including Apple and Google sign-in;</li>
            <li>operate marketplace listings, checkout, auctions, offers, layaway, live commerce, and trades;</li>
            <li>process payments, payouts, refunds, taxes, and disputes through Stripe and related tools;</li>
            <li>generate shipping rates and labels, validate addresses, and provide tracking through Shippo and carriers;</li>
            <li>deliver live video and host tools through Amazon IVS and related streaming infrastructure;</li>
            <li>send transactional email (verification, receipts, security alerts) through Resend;</li>
            <li>send push notifications you opt into on mobile through Expo;</li>
            <li>moderate content, investigate reports, enforce our Terms and Community Guidelines, and protect users;</li>
            <li>provide customer support and respond to legal requests;</li>
            <li>analyze usage, debug issues, improve performance, and develop new features;</li>
            <li>comply with law, tax, payment-network, and anti-fraud requirements.</li>
          </ul>
          <p className="mt-3 text-muted">
            We do not sell your personal information. We do not use your personal information for third-party
            cross-context behavioral advertising.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">3. How We Share Information</h2>
          <p className="mt-3 text-muted">We may share information with:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>
              <strong className="text-zinc-200">Other users</strong> — when needed for transactions (for example shipping
              name and address to a seller for fulfillment, username on listings, or public profile and review content);
            </li>
            <li>
              <strong className="text-zinc-200">Stripe</strong> — to process payments, Connect payouts, tax, fraud
              signals, and disputes;
            </li>
            <li>
              <strong className="text-zinc-200">Shippo and carriers</strong> — to quote rates, purchase labels, validate
              addresses, and provide tracking (USPS, UPS, FedEx, and others as returned by Shippo);
            </li>
            <li>
              <strong className="text-zinc-200">Supabase</strong> — for authentication, database, file storage, and
              Realtime features;
            </li>
            <li>
              <strong className="text-zinc-200">Netlify</strong> — to host the website and run serverless backend
              functions;
            </li>
            <li>
              <strong className="text-zinc-200">Resend</strong> — to deliver email;
            </li>
            <li>
              <strong className="text-zinc-200">Amazon Web Services (including IVS)</strong> — for live video ingest,
              playback, and related infrastructure;
            </li>
            <li>
              <strong className="text-zinc-200">Expo</strong> — to deliver push notifications to devices you register;
            </li>
            <li>
              <strong className="text-zinc-200">Apple and Google</strong> — when you authenticate with those services
              (subject to their policies);
            </li>
            <li>
              professional advisers, auditors, or successors in a merger, acquisition, or asset sale;
            </li>
            <li>law enforcement or regulators when required or permitted by law, or to protect rights and safety.</li>
          </ul>
          <p className="mt-3 text-muted">
            We may share aggregated or de-identified information that cannot reasonably identify you.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">4. Third-Party Providers</h2>
          <p className="mt-3 text-muted">
            Our service providers process data on our behalf under contractual obligations. Key providers include:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>
              <strong className="text-zinc-200">Stripe</strong> — payments, Connect, Tax, and financial compliance;
            </li>
            <li>
              <strong className="text-zinc-200">Shippo</strong> — shipping labels, rates, address tools, and tracking;
            </li>
            <li>
              <strong className="text-zinc-200">Supabase</strong> — auth, database, storage, Realtime;
            </li>
            <li>
              <strong className="text-zinc-200">Netlify</strong> — hosting and functions;
            </li>
            <li>
              <strong className="text-zinc-200">Resend</strong> — email;
            </li>
            <li>
              <strong className="text-zinc-200">AWS (IVS)</strong> — live streaming;
            </li>
            <li>
              <strong className="text-zinc-200">Expo</strong> — push delivery;
            </li>
            <li>
              optional providers we may enable (such as Redis, Kafka, OpenTelemetry, or alternate escrow partners when
              disclosed in-product).
            </li>
          </ul>
          <p className="mt-3 text-muted">
            These providers may process and store data in the United States and other countries. Their own privacy
            policies and terms apply to their services. Your use of the Platform constitutes consent to such processing
            as reasonably necessary to provide the services.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">5. Mobile App and Push Notifications</h2>
          <p className="mt-3 text-muted">
            If you install our mobile app and enable notifications, we store a push token linked to your account so we
            can send alerts about orders, trades, live activity, messages, and security events. You can disable push
            notifications in your device settings at any time; some in-app notifications may still appear when you use
            the Platform.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">6. Cookies and Tracking</h2>
          <p className="mt-3 text-muted">
            On the web we use cookies, local storage, session tokens, and similar technologies for login (including
            NextAuth sessions), preferences, security, fraud prevention, checkout (including Stripe Elements), and
            platform performance. You can control cookies through browser settings, but some features may not work if
            cookies are disabled.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">7. Public Content and Livestreams</h2>
          <p className="mt-3 text-muted">
            Content you post publicly — including listings, profile information, reviews, live chat, and livestream
            participation — may be visible to other users and may be copied or shared outside the Platform. Livestreams
            and related recordings or clips may be stored for moderation, dispute evidence, safety, and platform
            improvement for a limited retention period.
          </p>
          <p className="mt-3 text-muted">Do not post sensitive personal information you want kept private.</p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">8. AI Features</h2>
          <p className="mt-3 text-muted">
            If we offer AI tools, we may process prompts, inputs, outputs, and related metadata to provide and improve
            those tools. AI outputs may be inaccurate and should be independently verified.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">9. Retention</h2>
          <p className="mt-3 text-muted">
            We retain information as long as needed to provide the Platform, resolve disputes, meet legal and tax
            obligations, prevent fraud, and enforce our agreements. Some data must be kept after account deletion where
            required by law, payment networks, or active disputes.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">10. Security</h2>
          <p className="mt-3 text-muted">
            We use reasonable administrative, technical, and organizational safeguards, including access controls and
            encryption in transit for sensitive flows handled by our providers. No method of transmission or storage is
            perfectly secure. You are responsible for protecting your account credentials and devices.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">11. Your Rights and Choices</h2>
          <p className="mt-3 text-muted">
            Depending on your location, you may have rights to access, correct, delete, or limit certain processing, or
            to opt out of specific uses where applicable law provides those rights.
          </p>
          <p className="mt-3 text-muted">
            You can update profile and wallet information in the app or on the web. You can{" "}
            <Link href="/account-deletion" className="font-medium text-gold-bright hover:underline">
              delete your account
            </Link>{" "}
            from the web or mobile app where available. Deletion may be delayed or limited while trades, disputes,
            payouts, or legal holds are open.
          </p>
          <p className="mt-3 text-muted">
            To submit a privacy request, email{" "}
            <a href="mailto:support@shopgetvaulted.com" className="font-medium text-gold-bright hover:underline">
              support@shopgetvaulted.com
            </a>{" "}
            with the subject line “Privacy Request” and enough information for us to verify your account.
          </p>
          <p className="mt-3 text-muted">
            California residents may have additional rights under the CCPA/CPRA (know, delete, correct, opt out of
            sale/sharing — we do not sell personal information). We will not discriminate against you for exercising
            privacy rights where prohibited by law.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">12. International Users</h2>
          <p className="mt-3 text-muted">
            Get Vaulted is operated from the United States. If you access the Platform from outside the U.S., your
            information may be transferred to, stored in, and processed in the U.S. and other countries where our
            providers operate, which may have different data protection laws than your jurisdiction.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">13. Children</h2>
          <p className="mt-3 text-muted">
            The Platform is not intended for children under 18. We do not knowingly collect personal information from
            children under 13. If you believe a child under 13 has provided information, contact us and we will take
            appropriate steps to delete it.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">14. Changes</h2>
          <p className="mt-3 text-muted">
            We may update this Privacy Policy from time to time. The “Last updated” date at the top reflects the latest
            revision. Material changes may be communicated through the Platform or by email where appropriate.
            Continued use after changes means you accept the updated policy.
          </p>
        </section>

        <section id="contact">
          <h2 className="font-display text-lg font-semibold text-foreground">15. Contact</h2>
          <address className="mt-3 not-italic text-muted">
            Get Vaulted LLC
            <br />
            <a href="mailto:support@shopgetvaulted.com" className="font-medium text-gold-bright hover:underline">
              support@shopgetvaulted.com
            </a>
          </address>
        </section>
      </div>
    </main>
  );
}
