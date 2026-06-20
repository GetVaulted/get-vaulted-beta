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
      <p className="mt-2 text-xs text-zinc-500">Last updated: May 10, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-300">
        <section>
          <p className="text-muted">
            This Privacy Policy explains how Get Vaulted LLC collects, uses, shares, and protects personal information.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">1. Information We Collect</h2>
          <p className="mt-3 text-muted">We may collect:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>name, username, email, phone number, address, DOB;</li>
            <li>account, profile, and transaction information;</li>
            <li>listings, images, videos, messages, comments, reviews;</li>
            <li>payment and payout details;</li>
            <li>verification documents and tax information;</li>
            <li>device data, IP address, browser, logs, and usage analytics;</li>
            <li>information from processors, fraud tools, carriers, and vendors.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">2. How We Use Information</h2>
          <p className="mt-3 text-muted">We use information to:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>operate the platform;</li>
            <li>manage accounts and transactions;</li>
            <li>process payments, payouts, refunds, and disputes;</li>
            <li>verify identity and prevent fraud;</li>
            <li>moderate content and enforce policies;</li>
            <li>provide customer support;</li>
            <li>send service, transactional, and marketing messages where allowed;</li>
            <li>improve products, analytics, and security;</li>
            <li>comply with law and payment provider requirements.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">3. Sharing Information</h2>
          <p className="mt-3 text-muted">We may share information with:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>other users, when needed for marketplace activity;</li>
            <li>payment processors and financial institutions;</li>
            <li>hosting, storage, authentication, email, livestream, and analytics vendors;</li>
            <li>shipping carriers and fulfillment providers;</li>
            <li>fraud prevention and identity verification services;</li>
            <li>legal authorities, if required or permitted by law;</li>
            <li>business successors in a merger, acquisition, or sale.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">4. Third-Party Providers</h2>
          <p className="mt-3 text-muted">
            We use third-party providers such as Stripe, Netlify, Supabase, Resend, and AWS IVS for payment processing,
            hosting, backend services, storage, email delivery, and livestream infrastructure. These providers may
            process and store user data in the U.S. and other locations. Your use of the platform constitutes consent to
            such processing as reasonably necessary to provide the services.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">5. Cookies and Tracking</h2>
          <p className="mt-3 text-muted">
            We use cookies, pixels, SDKs, and similar technologies for login, preferences, analytics, security, fraud
            prevention, and platform performance.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">6. Public Content</h2>
          <p className="mt-3 text-muted">
            Content you post publicly or in livestreams, clips, reviews, or comments may be visible to others and may
            be copied or shared. Do not post information you want kept private.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">7. AI Features</h2>
          <p className="mt-3 text-muted">
            If we offer AI tools, we may process prompts, inputs, outputs, and related metadata to provide and improve
            those tools. AI outputs may be inaccurate and should be independently verified.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">8. Retention</h2>
          <p className="mt-3 text-muted">
            We retain information as long as needed for business, legal, tax, compliance, fraud prevention, and dispute
            purposes.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">9. Security</h2>
          <p className="mt-3 text-muted">
            We use reasonable safeguards, but no system is perfectly secure. You are responsible for protecting your
            account credentials and devices.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">10. Your Rights</h2>
          <p className="mt-3 text-muted">
            Depending on your location, you may have rights to access, correct, delete, or limit certain processing.
            You can{" "}
            <Link href="/account-deletion" className="font-medium text-gold-bright hover:underline">
              delete your account
            </Link>{" "}
            from the web or mobile app, or contact{" "}
            <a
              href="mailto:support@shopgetvaulted.com"
              className="font-medium text-gold-bright hover:underline"
            >
              support@shopgetvaulted.com
            </a>{" "}
            to submit a request.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">11. Children</h2>
          <p className="mt-3 text-muted">
            The platform is not intended for children under 18. We do not knowingly collect information from children
            under 13.
          </p>
        </section>

        <section id="contact">
          <h2 className="font-display text-lg font-semibold text-foreground">12. Contact</h2>
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
