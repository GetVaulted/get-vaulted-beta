# Social auth setup (Google + Apple)

Get Vaulted uses **Supabase Auth** as the identity provider for web and mobile. Social sign-in creates or links the same Supabase user that email/password uses; the web app bridges OAuth into **NextAuth** for cookie sessions.

---

## Supabase Dashboard

**Authentication → Providers**

| Provider | Enable | Notes |
|----------|--------|-------|
| **Google** | On | Web Client ID + Client Secret from Google Cloud Console |
| **Apple** | On | Services ID, Team ID, Key ID, `.p8` key (required for mobile + web Apple) |

**Authentication → URL Configuration → Redirect URLs**

Add every environment you use:

```
http://localhost:3000/auth/callback
http://127.0.0.1:3000/auth/callback
https://beta.shopgetvaulted.com/auth/callback
https://shopgetvaulted.com/auth/callback
https://www.shopgetvaulted.com/auth/callback
http://localhost:3000/mobile/auth/callback
https://beta.shopgetvaulted.com/mobile/auth/callback
https://shopgetvaulted.com/mobile/auth/callback
getvaulted://auth/callback
```

For **Netlify deploy previews**, add each preview host explicitly, e.g.:

```
https://deploy-preview-123--your-site.netlify.app/auth/callback
```

Supabase does not support wildcard preview URLs — add previews as needed.

---

## Google Cloud Console

1. Create OAuth 2.0 credentials (Web application) for the Supabase callback:
   - Authorized redirect URI: `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
2. For **mobile Android**, add an Android OAuth client with package `com.getvaulted.app` and your release/debug SHA-1.
3. For **mobile iOS**, add an iOS OAuth client with bundle ID `com.getvaulted.app` (used when testing native Google flows; browser OAuth uses the web redirect above).

Copy **Web client ID + secret** into Supabase Google provider settings.

---

## Apple Developer

1. Enable **Sign in with Apple** on the App ID `com.getvaulted.app`.
2. Create a **Services ID** (for web + Supabase):
   - Domains: `beta.shopgetvaulted.com`, `shopgetvaulted.com`, `<project-ref>.supabase.co`
   - Return URLs: `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
3. Create a **Sign in with Apple** key (.p8) and add Team ID, Key ID, Services ID, and key to Supabase Apple provider.

---

## Web app

| Flow | Path |
|------|------|
| Start OAuth | Sign In / Sign Up → **Continue with Google** or **Continue with Apple** |
| Callback | `/auth/callback?returnTo=…` → exchanges PKCE code → NextAuth `supabase-oauth` provider |
| Post-login | Respects `returnTo` (default `/marketplace`) |

**Env (already required):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`

`NEXTAUTH_URL` must match the browser origin users sign in from (e.g. `https://beta.shopgetvaulted.com` on beta).

---

## Mobile app

| Provider | Platform | Mechanism |
|----------|----------|-----------|
| **Google** | iOS + Android | Supabase OAuth in `WebBrowser.openAuthSessionAsync` → `{EXPO_PUBLIC_SITE_URL}/mobile/auth/callback` |
| **Apple** | iOS only | Native `expo-apple-authentication` → `signInWithIdToken` |

**Expo config (`mobile/app.json`):**

- `scheme`: `getvaulted`
- `ios.usesAppleSignIn`: `true`
- `ios.bundleIdentifier` / `android.package`: `com.getvaulted.app`

**Env:**

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — same project as web
- `EXPO_PUBLIC_SITE_URL` — must match the web host used for OAuth return (LAN IP for device dev, `https://beta.shopgetvaulted.com` on beta)
- `EXPO_PUBLIC_AUTH_APPLE_ENABLED=true` — included in `mobile/eas.json`; on iOS the Apple button also shows when unset

After OAuth login, the app calls `/api/account/identity` to create the Prisma user row immediately (username auto-generated). Email/password login is unchanged.

---

## Manual test checklist

- [ ] Web: Google sign **up** (new Google account)
- [ ] Web: Google sign **in** (returning user)
- [ ] Web: Apple sign up / sign in (when `NEXT_PUBLIC_AUTH_OAUTH_APPLE_ENABLED=true` on Netlify)
- [ ] Mobile: Google sign up / sign in (iOS + Android)
- [ ] Mobile: Apple sign up / sign in (iOS)
- [ ] Mobile: email/password still works
- [ ] Session persists after app restart (Keep me logged in on)
- [ ] Cancel OAuth → no crash, clear message
- [ ] Seller HQ / create listing gates unchanged after social login

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `redirect_uri_mismatch` | Add exact callback URL to Supabase allowlist + Google/Apple console |
| Web loops on callback | Check `NEXTAUTH_URL` matches current host |
| Mobile Google never returns | `EXPO_PUBLIC_SITE_URL` must be reachable from phone (LAN IP, not `localhost`) |
| Apple unavailable on Android | Expected — Apple button only shows on iOS |
| Account exists but no username | OAuth users get auto-generated username via `ensurePrismaUserForSupabaseAuth` |

See also: [beta-environment-alignment.md](./beta-environment-alignment.md)
