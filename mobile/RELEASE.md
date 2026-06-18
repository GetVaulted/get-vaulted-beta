# Get Vaulted mobile release workflow

Unified EAS release commands for iOS and Android. Run everything from the `mobile/` directory in PowerShell (or any shell).

## Prerequisites

1. Install dependencies: `npm install`
2. Install EAS CLI (once): `npm install -g eas-cli`
3. Log in to Expo: `eas login`
4. Configure store credentials in [expo.dev](https://expo.dev) (or via `eas credentials`) for:
   - Apple App Store Connect / TestFlight
   - Google Play Console
5. Commit or stash local changes before a release. `release:version` edits `app.json`.

```powershell
cd "C:\Users\mrmrs\OneDrive\Desktop\Brand New Get Vaulted App\mobile"
```

## Version numbers

| Field | Location | Purpose |
| --- | --- | --- |
| `expo.version` | `app.json` | User-facing semver (e.g. `1.0.0`) |
| `expo.ios.buildNumber` | `app.json` | iOS build sent to App Store Connect |
| `expo.android.versionCode` | `app.json` | Android integer sent to Google Play |

`release:version` keeps **iOS `buildNumber` and Android `versionCode` equal** on every bump. Production builds use `appVersionSource: "local"` in `eas.json`, so EAS reads these values from `app.json` (auto-increment is disabled so the bump script remains the single source of truth).

## Full release (iOS + Android)

Runs checks → version bump → EAS build → store submit:

```powershell
npm run release:all
```

### Step by step

```powershell
npm run release:check    # TypeScript + Vitest
npm run release:version  # Bump build numbers (and optionally semver)
npm run release:build    # eas build --platform all --profile production
npm run release:submit   # eas submit --platform all --profile production
```

Commit the `app.json` change after `release:version` and before or after the build:

```powershell
git add app.json
git commit -m "chore(mobile): bump version for release"
```

### Version bump options

```powershell
# Increment build numbers by 1 (default)
npm run release:version

# Also set user-facing semver
npm run release:version -- --version 1.1.0

# Set an explicit build number (must be higher than current)
npm run release:version -- --set-build 12

# Preview changes without writing app.json
npm run release:version -- --dry-run
```

## iOS only

```powershell
npm run release:check
npm run release:version
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

## Android only

```powershell
npm run release:check
npm run release:version
eas build --platform android --profile production
eas submit --platform android --profile production
```

## Internal testing builds

Use the `preview` profile (`distribution: internal` in `eas.json`). These are for TestFlight internal testers and Google Play internal track — not public store releases.

### Build internal binaries

Both platforms:

```powershell
npm run release:check
npm run release:version
eas build --platform all --profile preview
```

iOS only:

```powershell
eas build --platform ios --profile preview
```

Android only:

```powershell
eas build --platform android --profile preview
```

### Submit internal builds to stores

**iOS (TestFlight):** submit the latest `preview` build to App Store Connect. TestFlight internal testing still uses ASC; assign testers in App Store Connect after processing.

```powershell
eas submit --platform ios --profile production --latest
```

**Android (internal track):** `eas.json` maps the `preview` submit profile to Google Play `internal` track.

```powershell
eas submit --platform android --profile preview --latest
```

You can also distribute Android internal APKs directly from the EAS build page without Play Console submit.

## Production builds

Production profile builds store-ready binaries and submits to public release channels (App Store / Play production or your configured default tracks).

```powershell
npm run release:all
```

Or manually:

```powershell
npm run release:check
npm run release:version
npm run release:build
npm run release:submit
```

After submit:

- **iOS:** In App Store Connect, add the build to TestFlight external testing or submit for App Review.
- **Android:** In Google Play Console, promote the build from internal/testing to production when ready.

## Checks (`release:check`)

Runs:

- `npm run typecheck` — `tsc --noEmit`
- `npm run test` — `vitest run`

There is no mobile ESLint script today. Add `"lint": "eslint ."` to `package.json` and extend `release:check` if you add linting later.

## If Apple or Google rejects or fails

### EAS build failed

1. Open the build log on [expo.dev](https://expo.dev) → your project → Builds.
2. Fix the error (credentials, native config, dependency, etc.).
3. **Do not** run `release:version` again unless you already consumed the bumped build number in a successful store upload. If the build never reached a store, reuse the same `app.json` numbers and rebuild.
4. Re-run `npm run release:build` (or platform-specific `eas build`).

### EAS submit failed

1. Read the submit log: missing credentials, expired API key, or wrong bundle ID / package name are common.
2. Refresh credentials: `eas credentials` (choose iOS or Android).
3. Re-submit without rebuilding if the binary is fine:

   ```powershell
   eas submit --platform ios --profile production --latest
   eas submit --platform android --profile production --latest
   ```

### Apple App Review rejection

1. Read Resolution Center feedback in App Store Connect.
2. Fix app or metadata issues in code / `app.json` / store listing.
3. Bump version if Apple requires a new binary:

   ```powershell
   npm run release:version -- --version 1.0.1
   eas build --platform ios --profile production
   eas submit --platform ios --profile production --latest
   ```

4. Resubmit for review in App Store Connect.

Common causes: missing usage strings (camera, mic, photos), Sign in with Apple, export compliance, IAP / payment disclosures.

### Google Play rejection or policy hold

1. Check **Policy status** and **Release** → **App bundle explorer** in Play Console.
2. Fix policy violations or target API level requirements.
3. If a new binary is required:

   ```powershell
   npm run release:version
   eas build --platform android --profile production
   eas submit --platform android --profile production --latest
   ```

4. Roll out again on the appropriate track (internal → closed → production).

### “Version code already used” / “Build number already exists”

The store already has that build. Bump again and rebuild:

```powershell
npm run release:version
npm run release:build
npm run release:submit
```

### iOS / Android build numbers out of sync

`release:version` refuses to run if `buildNumber` ≠ `versionCode`. Edit `app.json` so both match, then run `release:version` again.

## EAS profiles reference

| Profile | Build distribution | Typical use |
| --- | --- | --- |
| `development` | internal + dev client | Local dev with `expo-dev-client` |
| `preview` | internal | TestFlight / Play internal testing |
| `production` | store | App Store + Play production releases |

## Quick command reference

| Goal | Command |
| --- | --- |
| Full production release | `npm run release:all` |
| Checks only | `npm run release:check` |
| Bump versions only | `npm run release:version` |
| Build both (production) | `npm run release:build` |
| Submit both (production) | `npm run release:submit` |
| Build both (internal) | `eas build --platform all --profile preview` |
| Submit Android internal | `eas submit --platform android --profile preview --latest` |
