import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reporting & Safety — Get Vaulted",
  description:
    "How to report harassment, fraud, counterfeit items, live show issues, and other safety concerns on Get Vaulted.",
};

const REPORT_REASONS = [
  { label: "Harassment", detail: "Threats, bullying, hate, doxing, or targeted abuse in chat, messages, or profiles." },
  { label: "Counterfeit / fake item", detail: "Suspected fake, altered, or misrepresented goods in listings or live sales." },
  { label: "Scam / fraud", detail: "Off-platform payment requests, phishing, identity fraud, or deceptive schemes." },
  { label: "Spam", detail: "Unwanted repetition, promotional flooding, or bot-like behavior." },
  { label: "Inappropriate content", detail: "Sexual, violent, or otherwise unsafe content in listings, streams, or chat." },
  { label: "Fake bids / shill bidding", detail: "Manipulated auctions or bids intended to inflate prices." },
  { label: "Seller misconduct", detail: "Non-shipment, bait-and-switch, dishonest break rules, or fulfillment abuse." },
  { label: "Buyer misconduct", detail: "Chargeback abuse, refusal to pay, or bad-faith dispute behavior." },
  { label: "IP / copyright violation", detail: "Unauthorized use of photos, logos, or copyrighted material." },
  { label: "Other", detail: "Anything else that violates our policies — add details in the report form." },
] as const;

export default function ReportingSafetyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
      <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
        ← Home
      </Link>
      <h1 className="font-display mt-6 text-2xl font-bold text-foreground">Reporting &amp; Safety</h1>
      <p className="mt-2 text-xs text-zinc-500">Last updated: June 26, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-300">
        <section>
          <p className="text-muted">
            Get Vaulted is built for fair collector markets and respectful live commerce. If you see behavior that
            violates our{" "}
            <Link href="/community-guidelines" className="font-semibold text-gold-bright hover:underline">
              Community Guidelines
            </Link>{" "}
            or{" "}
            <Link href="/terms" className="font-semibold text-gold-bright hover:underline">
              Terms of Service
            </Link>
            , report it so our trust &amp; safety team can review and take action.
          </p>
          <p className="mt-3 text-muted">
            You must be signed in to submit an in-app report. Reports are stored securely and reviewed by moderators.
            Submitting false or abusive reports may affect your account.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">What you can report</h2>
          <p className="mt-3 text-muted">
            When you submit a report, you choose a reason from the list below and optionally add details (up to 4,000
            characters). Pick the closest match — extra context helps us investigate faster.
          </p>
          <ul className="mt-4 space-y-3">
            {REPORT_REASONS.map((r) => (
              <li key={r.label} className="rounded-xl border border-white/[0.06] bg-zinc-950/40 px-4 py-3">
                <p className="font-semibold text-zinc-100">{r.label}</p>
                <p className="mt-1 text-muted">{r.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">How to report in the app and on web</h2>
          <p className="mt-3 text-muted">
            Look for <strong className="text-zinc-200">Report</strong> actions on the content or user involved. Each
            report is tied to a specific target so we can find the right evidence.
          </p>

          <h3 className="mt-5 font-semibold text-zinc-100">Users and profiles</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>
              <strong className="text-zinc-200">Web:</strong> open a user&apos;s profile or storefront → Report user.
            </li>
            <li>
              <strong className="text-zinc-200">Mobile:</strong> open a profile → report option from the profile menu.
            </li>
          </ul>

          <h3 className="mt-5 font-semibold text-zinc-100">Marketplace listings</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>
              <strong className="text-zinc-200">Web:</strong> listing page → Report listing.
            </li>
            <li>
              <strong className="text-zinc-200">Mobile:</strong> product / listing detail → Report.
            </li>
          </ul>

          <h3 className="mt-5 font-semibold text-zinc-100">Live shows and chat</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>
              <strong className="text-zinc-200">Report the show:</strong> use Report show on the live room (web live
              player or mobile live feed) for room-wide issues — misleading breaks, policy violations, or unsafe host
              conduct.
            </li>
            <li>
              <strong className="text-zinc-200">Report a chat message:</strong> tap the username or message actions in
              live chat → Report. Include context in the details field (what was said and why it violates policy).
            </li>
            <li>
              <strong className="text-zinc-200">Break spots:</strong> break-related targets may be reported when
              offered in-product.
            </li>
          </ul>

          <h3 className="mt-5 font-semibold text-zinc-100">Orders</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>
              <strong className="text-zinc-200">Web &amp; mobile:</strong> order detail → Report order issue for
              fulfillment fraud, wrong item shipped, or seller/buyer abuse tied to a specific order.
            </li>
          </ul>
          <p className="mt-3 text-muted">
            For routine shipping delays or item condition problems, open your order and use the refund request flow when
            available, or message the seller first — use reports when you believe policy was violated or fraud occurred.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">What happens after you report</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Your report is logged with the target type, reason, timestamp, and your account ID.</li>
            <li>Trust &amp; safety reviewers evaluate the report against our guidelines and applicable law.</li>
            <li>
              We may remove content, warn users, mute or ban from live rooms, restrict bidding, suspend selling, hold
              payouts, or permanently terminate accounts.
            </li>
            <li>
              You may not receive detailed outcome updates when privacy, safety, or legal constraints prevent disclosure
              — that does not mean your report was ignored.
            </li>
            <li>We may contact you at your account email if we need screenshots, order IDs, or additional context.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Live room safety tools</h2>
          <p className="mt-3 text-muted">
            Live hosts and assigned moderators have additional tools to protect their rooms in real time, including
            muting chat, timing out users, removing someone from a show, blocking bidding on breaks, and (for hosts)
            banning a user from all of that seller&apos;s future streams. These actions are separate from platform-wide
            reports but may trigger review if abused.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Order problems vs. trust reports</h2>
          <div className="mt-3 space-y-3 text-muted">
            <p>
              <strong className="text-zinc-200">Shipping, wrong item, or not as described:</strong> open your order →
              request a refund or message the seller first. Escalate to Get Vaulted support from the refund flow if the
              seller denies a valid claim.
            </p>
            <p>
              <strong className="text-zinc-200">Fraud, counterfeits, or policy violations:</strong> submit an in-app
              report and include listing links, order IDs, photos, and tracking information in the details field.
            </p>
            <p>
              <strong className="text-zinc-200">Trades:</strong> open a dispute from trade detail for non-shipment or
              item issues; report the user if you believe intentional fraud occurred.
            </p>
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Fraud and off-platform payments</h2>
          <p className="mt-3 text-muted">
            Never send payment outside Get Vaulted checkout, live wallet, or other payment flows we provide — including
            PayPal, Venmo, Cash App, wire, or crypto — unless Get Vaulted explicitly authorizes it in writing. Off-platform
            payment requests are a common scam vector.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Report the user or listing with reason <strong className="text-zinc-200">Scam / fraud</strong>.</li>
            <li>Do not complete the transaction off-platform.</li>
            <li>
              If you already paid outside the Platform, gather evidence and email{" "}
              <a href="mailto:support@shopgetvaulted.com" className="font-semibold text-gold-bright hover:underline">
                support@shopgetvaulted.com
              </a>{" "}
              — recovery may be limited.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Urgent and emergency situations</h2>
          <p className="mt-3 text-muted">
            If someone is in <strong className="text-zinc-200">immediate danger</strong>, contact{" "}
            <strong className="text-zinc-200">local emergency services (911 in the U.S.)</strong> first. Get Vaulted
            reports are not a substitute for emergency response.
          </p>
          <p className="mt-3 text-muted">
            After ensuring safety, email{" "}
            <a href="mailto:support@shopgetvaulted.com" className="font-semibold text-gold-bright hover:underline">
              support@shopgetvaulted.com
            </a>{" "}
            with subject line <strong className="text-zinc-200">URGENT SAFETY</strong> and include:
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>usernames and profile links;</li>
            <li>live room name or link and approximate time (with timezone);</li>
            <li>order or listing IDs if relevant;</li>
            <li>screenshots or screen recordings if you have them.</li>
          </ul>
          <p className="mt-3 text-muted">
            For suspected child exploitation, threats of violence, or self-harm, contact law enforcement immediately and
            then notify us with the same information.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">False or retaliatory reports</h2>
          <p className="mt-3 text-muted">
            Reports must be made in good faith. Filing false reports, report brigading, or retaliating against buyers or
            sellers who left honest reviews may result in warnings, restrictions, or account suspension.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Law enforcement and legal requests</h2>
          <p className="mt-3 text-muted">
            Get Vaulted LLC may preserve and disclose account, transaction, messaging, and livestream-related information
            when required by law or valid legal process. Law enforcement and authorized agencies may contact{" "}
            <a href="mailto:support@shopgetvaulted.com" className="font-semibold text-gold-bright hover:underline">
              support@shopgetvaulted.com
            </a>{" "}
            with appropriate documentation. We cannot provide information without proper legal authority.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Related resources</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>
              <Link href="/community-guidelines" className="font-semibold text-gold-bright hover:underline">
                Community Guidelines
              </Link>{" "}
              — rules for chat, listings, and live conduct.
            </li>
            <li>
              <Link href="/terms#seller-obligations" className="font-semibold text-gold-bright hover:underline">
                Seller obligations
              </Link>{" "}
              — fulfillment and authenticity requirements in our Terms.
            </li>
            <li>
              <Link href="/support" className="font-semibold text-gold-bright hover:underline">
                Help Center
              </Link>{" "}
              — step-by-step guides for orders, disputes, and account help.
            </li>
            <li>
              <Link href="/privacy" className="font-semibold text-gold-bright hover:underline">
                Privacy Policy
              </Link>{" "}
              — how we handle data from reports and investigations.
            </li>
          </ul>
        </section>

        <section id="contact">
          <h2 className="font-display text-lg font-semibold text-foreground">Contact</h2>
          <p className="mt-3 text-muted">
            Questions about reporting or safety policies:
          </p>
          <address className="mt-2 not-italic text-muted">
            <a href="mailto:support@shopgetvaulted.com" className="font-medium text-gold-bright hover:underline">
              support@shopgetvaulted.com
            </a>
          </address>
        </section>
      </div>
    </main>
  );
}
