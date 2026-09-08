# Blocking fake/disposable-email signups (Supabase "Before User Created" hook)

Blocks account creation when the signup email's domain is a known disposable/temp-inbox
provider (Mailinator, Guerrilla Mail, 10-minute-mail style services). Covers **both** mobile
(direct `supabase.auth.signUp()`) and web (`registerAccountViaSupabaseAuth()`) signups, plus
Google/Apple OAuth, since it runs inside Supabase's own `auth.users` creation — not something
either client can bypass by calling a different endpoint.

This only needs one manual step in the Supabase Dashboard (can't be done via code/CLI).

## 1. Deploy this code first

The endpoint is `web/src/app/api/auth-hooks/before-user-created/route.ts`. It needs to be live at
a public HTTPS URL before you configure the hook in step 2, e.g.:

```
https://shopgetvaulted.com/api/auth-hooks/before-user-created
```

(or your beta/staging domain, if configuring there first).

## 2. Configure the hook in Supabase

1. Open the Supabase Dashboard for the project → **Authentication** → **Hooks**.
2. Find **"Before User Created"** → enable it → choose **HTTPS** (HTTP hook, not Postgres
   function).
3. Paste in the URL from step 1.
4. Supabase generates a signing secret in the format `v1,whsec_...` — click to reveal/copy it.
5. Save.

## 3. Set the secret as an env var

Add the secret you copied to your deploy host's environment variables (Netlify, etc.) and to
local `.env` if testing locally:

```
SUPABASE_BEFORE_USER_CREATED_HOOK_SECRET="v1,whsec_the-secret-supabase-gave-you"
```

Paste it in exactly as Supabase showed it — do not strip the `v1,whsec_` prefix yourself, the
code handles that.

**Redeploy after setting the env var.** Until it's set, the route fails closed in production
(rejects all signups with a 500) rather than silently skipping the check — better to notice
signups are broken than to silently stop blocking fake emails. Locally in development it fails
open instead, so you're not blocked before you've configured anything.

## 4. Verify

Try signing up (mobile or web) with an email at a known disposable domain, e.g.
`test@mailinator.com` or `test@10minutemail.com`. You should see: "That email provider isn't
supported. Please sign up with a permanent email address (e.g. Gmail, Outlook, iCloud)." A normal
Gmail/Outlook/etc. signup should go through as usual.

Every hook invocation (allowed or blocked) is logged to the `WebhookEventLog` table with
`source: "supabase_before_user_created"` — useful for confirming it's firing in production and
for reviewing how many signups are being blocked.

## Keeping the domain list current

The blocklist is a static snapshot at `web/src/lib/data/disposable-email-domains.json` (~4,250
domains), taken from the community-maintained
[disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains)
project (MIT licensed) as of 2026-09-08. It's checked into the repo rather than pulled in as an
npm dependency. New disposable domains appear over time — periodically re-download that
project's `disposable_email_blocklist.conf`, convert it to a JSON array of lowercase domains, and
replace this file to stay current.

## Notes / known gaps

- Web only goes through Supabase (and thus this hook) when `isBetaDeployment()` is true — the
  non-beta web signup path creates a local Prisma user directly and never touches Supabase Auth.
  If web ever runs in non-beta mode in production, signups there won't be covered by this check.
- The list matches on exact domain and parent domains (so `foo.mailinator.com` is blocked because
  `mailinator.com` is listed), not on typo-squats or lookalike domains — someone determined to
  fake an email can still use a domain not on the list.
- This blocks by domain, not by verifying the specific mailbox exists or is reachable.
