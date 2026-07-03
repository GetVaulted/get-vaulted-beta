# Production error monitoring — Sentry setup + first-days plan

Get Vaulted ships with `@sentry/nextjs` wired in, gated entirely behind env vars. **It is a
complete no-op until you set a DSN** — nothing to revert, nothing that can break the build if you
launch before creating a Sentry account.

---

## 1. What's already implemented

| File | Runtime | Purpose |
|------|---------|---------|
| `src/instrumentation-client.ts` | Browser | Client-side errors, unhandled rejections, router transition breadcrumbs |
| `src/sentry.server.config.ts` | Node (route handlers, server components, cron) | Server-side exceptions |
| `src/sentry.edge.config.ts` | Edge (middleware) | Edge runtime exceptions |
| `src/instrumentation.ts` (`onRequestError`) | Node + Edge | Reports errors Next.js catches internally (e.g. thrown in a Server Component render) that wouldn't otherwise reach Sentry |
| `src/app/global-error.tsx` | Browser | Catches render errors that escape the whole React tree (root layout crash) and shows a branded fallback instead of a blank white screen |

All five files check for a DSN before doing anything:

- Server/edge: `SENTRY_DSN`
- Browser: `NEXT_PUBLIC_SENTRY_DSN` (must be `NEXT_PUBLIC_*` to ship in the client bundle)

If unset, `Sentry.init()` is never called and the SDK's exported helpers (`captureException`,
`captureRequestError`, etc.) are safe to call anyway — they just do nothing.

Sampling defaults to a low rate in production (5% traces, 10% session replay-on-error, 0% full
session replay) to keep this free-tier friendly. Tune in the three config files once you have a
sense of traffic and Sentry's quota.

**Not included (deliberately, to avoid launch risk):** the `withSentryConfig` Next.js config
wrapper and source-map upload during build. That requires a Sentry auth token in CI/Netlify and
its own failure modes at build time. Errors are still fully captured and readable (just without
mapped stack traces to original TS source) without it — add it later as a follow-up once a Sentry
org exists and you're comfortable wiring a build-time secret.

---

## 2. One-time setup (~10 minutes, before or after launch)

1. Create a free Sentry account and project (platform: Next.js) at sentry.io.
2. Copy the DSN from Project Settings → Client Keys (DSN).
3. In Netlify → Site settings → Environment variables, add for the **production** context:
   - `SENTRY_DSN` = the DSN
   - `NEXT_PUBLIC_SENTRY_DSN` = the same DSN
   - `SENTRY_ENVIRONMENT` = `production`
   - `NEXT_PUBLIC_SENTRY_ENVIRONMENT` = `production`
4. Optionally repeat with a second Sentry project (or the same project, `SENTRY_ENVIRONMENT=beta`)
   for the beta Netlify context, so beta noise doesn't mix with production alerts.
5. Redeploy. Trigger a throwaway error (e.g. temporarily throw in a test API route) and confirm it
   shows up in the Sentry Issues stream, then revert the test throw.
6. In Sentry → Alerts, create a rule: "New issue" → notify a Slack channel or email you'll
   actually check in the first week. This is the single highest-value step — an idle dashboard
   nobody looks at is not monitoring.

---

## 3. First-days-after-launch monitoring plan

**Day 0 (launch day):**

- Keep the Sentry Issues stream open in a tab during the launch window. Treat any new issue
  touching `/api/stripe/*`, `/api/checkout*`, `/api/orders/*`, or `/api/webhooks*`-equivalent
  routes (`stripe/webhook`, `shippo/webhook`) as high-priority — these are money paths.
- Watch the Netlify function logs / deploy log in parallel for build or cold-start errors Sentry
  wouldn't see (e.g. a route that fails before `instrumentation.ts` loads).
- Spot-check `WebhookEventLog` (Prisma table) for `status = "failed"` rows — this catches Stripe/
  Shippo webhook failures even if signature/config issues prevented Sentry from ever seeing the
  request (e.g. the fail-closed 503s added for `CRON_SECRET`/`SHIPPO_WEBHOOK_SECRET`).
- Do one real end-to-end purchase yourself (small/refundable item) after deploy to confirm the
  Stripe → webhook → order → payout pipeline is healthy, not just "no exceptions thrown."

**Days 1–3:**

- Check Sentry once in the morning and once in the evening. Triage new issues by volume (an issue
  hit by many users > a rare edge case) and by path (checkout/payments/auth > cosmetic UI).
- Watch for **new** issue types, not just volume — a single new error class after a deploy is more
  actionable than steady background noise from, e.g., bot traffic hitting bad URLs.
- Re-run `npm run check:production-deployment` (see `docs/production-launch-config.md`) if
  anything looks like a config drift (wrong Stripe mode, misaligned Supabase project, etc.).

**Days 4–7:**

- Move to a daily check. Set the Sentry alert rule threshold (e.g. "issue seen by >5 users") so
  you stop getting paged for one-off client errors and only for real regressions.
- Write down (in this doc or a follow-up) any recurring low-value noise you see (e.g. browser
  extensions throwing, known third-party script errors) and add a Sentry inbound filter so future
  signal isn't buried.

**Rollback trigger:** if Sentry (or the manual purchase test) surfaces an error in the
checkout/payment/webhook path that affects more than a handful of users, or the `Order`/`Payout`
tables show inconsistent state, stop taking new traffic changes and roll back the Netlify deploy
to the last known-good build rather than trying to hotfix forward under pressure.

---

## 4. Mobile (deferred)

Mobile (Expo/React Native) does not yet have Sentry (`sentry-expo` / `@sentry/react-native`)
wired in — this was scoped out to avoid EAS build config changes this close to launch. Today,
mobile crashes surface via App Store Connect / Play Console crash reports and Expo's own crash
logs; that's an acceptable stopgap for launch. Revisit adding `@sentry/react-native` as a
near-term follow-up once web monitoring is validated in production.
