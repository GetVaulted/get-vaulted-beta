# Get Vaulted — Security Audit

**Date:** September 7, 2026
**Scope:** `web/` (Next.js/Prisma backend) and `mobile/` (Expo/React Native)
**Method:** Manual code review — auth/session handling, webhook signature verification, admin access control, injection risks, hardcoded secrets, IDOR on order/payment/user routes.

This was a targeted manual review of the highest-risk areas for a live-commerce payments app, not an exhaustive automated scan. Treat it as a strong pass, not a guarantee nothing else exists.

---

## Findings

### 1. HIGH — PayPal webhook signature is not actually verified

**File:** `web/src/lib/paypal.ts` (`verifyPayPalWebhookSignature`, lines 97–115)

In production (when `PAYPAL_WEBHOOK_ID` is set), the function only checks that five PayPal headers are *present* (`paypal-transmission-id`, `paypal-transmission-sig`, `paypal-transmission-time`, `paypal-cert-url`, `paypal-auth-algo`). It never fetches PayPal's certificate or cryptographically validates the signature. Any of those header values can be fabricated by an attacker.

**Impact:** Anyone who knows (or guesses) your webhook URL can POST a forged PayPal Payouts event to `web/src/app/api/paypal/webhook/route.ts` with made-up header values and have it accepted as genuine. That event flows into `applyPayPalPayoutWebhookStatus`, which updates `order.paypalPayoutStatus` / triggers manual review — so a forged event could mark a payout as succeeded/failed incorrectly, or flag arbitrary orders for manual review.

**Fix:** Implement full PayPal transmission verification — fetch the cert from `paypal-cert-url` (validate it's actually a `paypal.com` host), verify the RSA signature over `transmission-id|transmission-time|webhook-id|crc32(body)` using `paypal-auth-algo`, or call PayPal's `POST /v1/notifications/verify-webhook-signature` API (simplest to implement correctly). Until fixed, this endpoint should be treated as unauthenticated.

---

### Areas reviewed with no issues found

**Auth & session handling** — NextAuth (web cookie sessions) and Supabase Bearer JWT (mobile) both resolve to a canonical Prisma `User` row, checking `suspendedAt` / `accountDeletedAt` / email verification consistently across both paths. Login is rate-limited per-email (not per-IP, so IP rotation doesn't bypass it). The previously-reported "existing user routed to create-username" bug (fail-closed error handling) is already fixed.

**Admin route access control** — All 65 routes under `web/src/app/api/admin/**` call `requireAdmin()`, and every exported HTTP method in every file has a matching call that checks `.ok` before proceeding (verified by pairing method-export counts against `requireAdmin(` call counts). Spot-checked the money-moving ones directly (`payouts/release-seller`, `payouts/paypal`, `orders/[id]/payout`, `users/[id]/instant-payout`, `users/[id]/platform-credit`, `refund-requests`, `export`) — all gate correctly and return the 403 response on failure.

**Other webhook signature verification** — Stripe (`stripe.webhooks.constructEvent`, real HMAC verification, rejects on bad/missing signature), Shippo (HMAC verify, and fails closed with a 503 in production if the secret is unset rather than silently accepting), and Trustap/escrow (HTTP Basic auth with `timingSafeEqual` comparison, fails closed if credentials aren't configured) are all implemented correctly.

**Injection risks** — Every `$queryRaw`/`$executeRaw` call in the codebase uses Prisma's tagged-template form (auto-parameterized), not `$queryRawUnsafe`/`$executeRawUnsafe` with string concatenation. No SQL injection vector found. No `exec`/`execSync`/`spawn` calls run on user-controlled input (the only `execSync` usage is fixed test-setup commands).

**Hardcoded secrets** — No API keys, private keys, or secrets found hardcoded in `web/src` or `mobile/src`. Only `.env.example` is committed to git; all real `.env` files are gitignored. The mobile bundle only embeds `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, which are designed to be public (protected by Supabase Row Level Security, not secrecy).

**IDOR on order/payment/user routes** — Spot-checked order detail/mark-shipped, saved-card charge, payment method PATCH/DELETE, address PATCH/DELETE, and message thread GET/POST. Every one of these scopes its Prisma lookup to the authenticated user (`buyerId`/`sellerId`/`userId` in the `where` clause, or an explicit `OR` of both for orders/threads) rather than trusting the URL's `:id` alone. No cross-account access found in the routes reviewed.

---

## Recommendation priority

1. Fix the PayPal webhook signature verification (#1) — this is the one real gap found and it's on a payment-adjacent endpoint.
2. This review covered the highest-risk surface area but wasn't exhaustive — the full `api/` tree has 150+ routes. Worth a follow-up pass on lower-traffic routes (giveaways, trade offers, live-room moderation actions) if time allows.
