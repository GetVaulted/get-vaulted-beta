/**
 * TEMPORARY local-only escape hatch when Postgres is unreachable (e.g. ECONNREFUSED).
 *
 * Enable ONLY in development by setting in `.env.local`:
 *   GV_DEV_TEMP_NO_DB=1
 *
 * Remove the variable (or set to anything other than `1`) before real testing or deploy.
 * This is forced OFF when NODE_ENV is `production` so it cannot activate on beta/prod builds.
 *
 * Note: Sign-up (`POST /api/register`) still needs Postgres for email checks and
 * `user.create`. With this flag on, username “available” checks are stubbed — do not rely
 * on them for uniqueness until `DATABASE_URL` works and you remove this flag.
 */

let loggedWarning = false;

export function isDevTempNoDatabaseMode(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.GV_DEV_TEMP_NO_DB?.trim() !== "1") return false;
  if (!loggedWarning) {
    loggedWarning = true;
    console.warn(
      "[GV_DEV_TEMP_NO_DB] Stub responses active (no Postgres). Delete GV_DEV_TEMP_NO_DB from .env.local when your DATABASE_URL works.",
    );
  }
  return true;
}
