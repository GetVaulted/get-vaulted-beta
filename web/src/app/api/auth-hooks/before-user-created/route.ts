import { NextResponse } from "next/server";
import { isDisposableEmailDomain } from "@/lib/disposable-email-domains";
import { prisma } from "@/lib/prisma";
import { verifySupabaseAuthHookSignature } from "@/lib/verify-supabase-auth-hook";

export const runtime = "nodejs";

/**
 * Supabase "Before User Created" Auth Hook — https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
 *
 * Fires inside Supabase's own `auth.users` insert path, before ANY account is created —
 * password signup, OAuth (Google/Apple), the works — regardless of whether the request
 * originated from the mobile app's direct `supabase.auth.signUp()` or the web app's
 * `registerAccountViaSupabaseAuth()` (see src/lib/register-via-supabase-auth.ts). That makes
 * this the single shared enforcement point for both platforms, unlike MFA/AAL which had to be
 * built per-platform because web authenticates through NextAuth rather than Supabase directly.
 *
 * Configure in Supabase Dashboard → Authentication → Hooks → "Before User Created" → HTTP hook,
 * pointing at this route's URL. See docs/before-user-created-hook-setup.md for the exact steps
 * and the env var this route needs.
 *
 * Must respond within Supabase's 5-second HTTP hook timeout.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();

  const secret = process.env.SUPABASE_BEFORE_USER_CREATED_HOOK_SECRET?.trim();
  if (!secret) {
    // Fail CLOSED on missing config in production (never silently let unverified requests
    // create accounts), but fail OPEN in development so local signup isn't blocked before
    // anyone's configured the hook secret yet.
    console.error("[auth-hooks/before-user-created] SUPABASE_BEFORE_USER_CREATED_HOOK_SECRET is not set");
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: { http_code: 500, message: "Hook not configured." } }, { status: 500 });
    }
    return new NextResponse(null, { status: 204 });
  }

  const verification = verifySupabaseAuthHookSignature({
    rawBody,
    webhookId: req.headers.get("webhook-id"),
    webhookTimestamp: req.headers.get("webhook-timestamp"),
    webhookSignature: req.headers.get("webhook-signature"),
    secret,
  });

  if (!verification.ok) {
    console.error("[auth-hooks/before-user-created] signature verification failed", verification.reason);
    await logHookEvent({ processed: false, error: `signature_verification_failed:${verification.reason}`, rawBody });
    return NextResponse.json({ error: { http_code: 401, message: "Invalid signature." } }, { status: 401 });
  }

  let payload: BeforeUserCreatedPayload;
  try {
    payload = JSON.parse(rawBody) as BeforeUserCreatedPayload;
  } catch {
    await logHookEvent({ processed: false, error: "invalid_json", rawBody });
    return NextResponse.json({ error: { http_code: 400, message: "Invalid JSON." } }, { status: 400 });
  }

  const email = payload.user?.email?.trim().toLowerCase();

  // OAuth identities occasionally omit email (e.g. some Apple private-relay edge cases) — nothing
  // to check in that case, so allow rather than falsely blocking a legitimate signup.
  if (email && isDisposableEmailDomain(email)) {
    await logHookEvent({ processed: true, error: null, rawBody, blocked: true, email });
    return NextResponse.json(
      {
        error: {
          http_code: 400,
          message:
            "That email provider isn't supported. Please sign up with a permanent email address (e.g. Gmail, Outlook, iCloud).",
        },
      },
      { status: 400 },
    );
  }

  await logHookEvent({ processed: true, error: null, rawBody, blocked: false, email });
  return new NextResponse(null, { status: 204 });
}

type BeforeUserCreatedPayload = {
  metadata?: { uuid?: string; time?: string; name?: string; ip_address?: string };
  user?: { id?: string; email?: string; phone?: string; is_anonymous?: boolean };
};

async function logHookEvent(params: {
  processed: boolean;
  error: string | null;
  rawBody: string;
  blocked?: boolean;
  email?: string;
}): Promise<void> {
  await prisma.webhookEventLog
    .create({
      data: {
        source: "supabase_before_user_created",
        eventType: params.blocked ? "signup_blocked_disposable_email" : "signup_allowed",
        externalId: params.email ?? null,
        payload: params.rawBody.slice(0, 50_000),
        processed: params.processed,
        error: params.error,
      },
    })
    .catch(() => {});
}
