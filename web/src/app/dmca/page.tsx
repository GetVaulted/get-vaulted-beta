import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Copyright / DMCA Policy — Get Vaulted",
  description: "How to report copyright infringement on Get Vaulted, submit a counter-notice, and our repeat-infringer policy.",
};

export default function DmcaPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
      <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
        ← Home
      </Link>
      <h1 className="font-display mt-6 text-2xl font-bold text-foreground">Copyright / DMCA Policy</h1>
      <p className="mt-2 text-xs text-zinc-500">Last updated: July 3, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-300">
        <section className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Owner action required before launch</p>
          <p className="mt-2 text-muted">
            This page uses placeholder contact details for our DMCA Designated Agent. Before relying on the safe-harbor
            protections of 17 U.S.C. § 512, Get Vaulted must register a Designated Agent with the U.S. Copyright
            Office DMCA Designated Agent Directory (a fee applies) and replace the placeholder name/address/email
            below with that registered agent&apos;s information. This page is provided for policy completeness and is
            not a substitute for legal review.
          </p>
        </section>

        <section>
          <p className="text-muted">
            Get Vaulted LLC (&quot;Get Vaulted,&quot; &quot;we,&quot; &quot;us&quot;) respects the intellectual
            property rights of others and expects users of the platform to do the same. This policy explains how to
            report suspected copyright infringement, how a user can dispute a takedown, and how we handle repeat
            infringers, consistent with the Digital Millennium Copyright Act (DMCA), 17 U.S.C. § 512.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">1. Filing a takedown notice</h2>
          <p className="mt-3 text-muted">
            If you believe content on Get Vaulted (a listing photo or description, live-show content, profile image,
            message, or other user-generated content) infringes your copyright, send a written notice to our
            Designated Agent that includes all of the following:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>A physical or electronic signature of the copyright owner or a person authorized to act on their behalf;</li>
            <li>Identification of the copyrighted work claimed to have been infringed;</li>
            <li>
              Identification of the material claimed to be infringing, and information reasonably sufficient for us to
              locate it (e.g., a listing URL, live room name, or screenshot);
            </li>
            <li>Your name, mailing address, telephone number, and email address;</li>
            <li>
              A statement that you have a good-faith belief that use of the material is not authorized by the
              copyright owner, its agent, or the law; and
            </li>
            <li>
              A statement, made under penalty of perjury, that the information in the notice is accurate and that you
              are the copyright owner or authorized to act on the owner&apos;s behalf.
            </li>
          </ul>
          <p className="mt-3 text-muted">
            <strong className="text-zinc-200">DMCA Designated Agent (placeholder — see notice above):</strong>
            <br />
            [Designated Agent Name — to be registered with the U.S. Copyright Office]
            <br />
            Get Vaulted LLC
            <br />
            [Registered agent mailing address — to be added]
            <br />
            Email:{" "}
            <a href="mailto:copyright@shopgetvaulted.com" className="font-medium text-gold-bright hover:underline">
              copyright@shopgetvaulted.com
            </a>
          </p>
          <p className="mt-3 text-muted">
            Notices that do not substantially comply with these requirements may not receive a response. Submitting a
            knowingly false or bad-faith claim of infringement may result in liability for damages.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">2. What happens after a valid notice</h2>
          <p className="mt-3 text-muted">Upon receiving a substantially compliant notice, we will generally:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Remove or disable access to the identified material;</li>
            <li>Notify the user who posted the material and provide a copy of the notice;</li>
            <li>Document the action for our repeat-infringer records (see Section 4).</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">3. Filing a counter-notice</h2>
          <p className="mt-3 text-muted">
            If your content was removed and you believe it was removed in error or misidentification, you may submit a
            counter-notice to our Designated Agent that includes:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Your physical or electronic signature;</li>
            <li>Identification of the material removed and its location before removal;</li>
            <li>
              A statement, under penalty of perjury, that you have a good-faith belief the material was removed as a
              result of mistake or misidentification;
            </li>
            <li>Your name, address, telephone number, and a statement consenting to the jurisdiction of the federal court for your district (or, if outside the U.S., an appropriate judicial district), and that you will accept service of process from the person who filed the original notice.</li>
          </ul>
          <p className="mt-3 text-muted">
            Upon receiving a valid counter-notice, we may forward it to the original complaining party. Unless that
            party informs us they have filed a court action seeking to restrain the user from engaging in the
            infringing activity, we may reinstate the removed material within 10–14 business days, as required by the
            DMCA.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">4. Repeat infringer policy</h2>
          <p className="mt-3 text-muted">
            In appropriate circumstances, we will terminate, in whole or in part, the accounts of users who are
            determined to be repeat infringers. We track valid takedown notices against an account, and a pattern of
            valid, unresolved claims may result in listing removal, suspension, or permanent account termination in
            addition to any other enforcement available under our{" "}
            <Link href="/terms" className="font-medium text-gold-bright hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/community-guidelines" className="font-medium text-gold-bright hover:underline">
              Community Guidelines
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">5. Trademark and other IP claims</h2>
          <p className="mt-3 text-muted">
            This policy addresses copyright claims under the DMCA. For trademark infringement, counterfeit goods, or
            other intellectual-property concerns, use the in-app report tool (report reasons include
            &quot;Counterfeit / fake item&quot; and &quot;IP / copyright violation&quot;) described on our{" "}
            <Link href="/reporting-safety" className="font-medium text-gold-bright hover:underline">
              Reporting &amp; Safety
            </Link>{" "}
            page, or email{" "}
            <a href="mailto:copyright@shopgetvaulted.com" className="font-medium text-gold-bright hover:underline">
              copyright@shopgetvaulted.com
            </a>
            . See also our{" "}
            <Link href="/prohibited-items" className="font-medium text-gold-bright hover:underline">
              Prohibited Items Policy
            </Link>
            , which separately prohibits listing counterfeit or unauthorized replica goods.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">6. Questions</h2>
          <p className="mt-3 text-muted">
            Questions about this policy can be sent to{" "}
            <a href="mailto:support@shopgetvaulted.com" className="font-medium text-gold-bright hover:underline">
              support@shopgetvaulted.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
