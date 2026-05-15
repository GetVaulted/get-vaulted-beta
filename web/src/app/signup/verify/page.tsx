import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailForm } from "@/components/auth/VerifyEmailForm";

export const metadata: Metadata = {
  title: "Verify your email — Get Vaulted",
  description: "Enter the verification code we emailed you to finish creating your Get Vaulted account.",
};

export default function SignupVerifyPage() {
  return (
    <main className="relative flex min-h-0 flex-1 flex-col">
      <section className="relative box-border flex flex-col overflow-hidden border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(14,14,18,0.98)_0%,#030303_55%,#030303_100%)] py-10 md:min-h-[calc(100svh-3.5rem-1px)] md:py-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/25 to-transparent" aria-hidden />
        <div className="relative mx-auto w-full max-w-md px-4 sm:px-6">
          <Link
            href="/signup"
            className="inline-flex text-[11px] font-semibold uppercase tracking-wider text-gold-bright/90 transition hover:text-gold-bright"
          >
            ← Back to sign up
          </Link>
          <h1 className="font-display mt-6 text-2xl font-bold leading-tight text-foreground">Check your email</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Enter the 6-digit code we sent. After verification, you&apos;ll be signed in automatically.
          </p>
          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_56px_-28px_rgba(0,0,0,0.85)] sm:p-6">
            <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
              <VerifyEmailForm />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}
