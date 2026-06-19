/**
 * Quick sanity check: OAuth session cookie encodes/decodes with NEXTAUTH_SECRET.
 * Run: npx tsx scripts/test-oauth-session-cookie.ts
 */
import { decode } from "next-auth/jwt";
import { buildNextAuthSessionCookieChunks, nextAuthUseSecureCookies } from "../src/lib/next-auth-session-cookie";

async function main() {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    console.error("NEXTAUTH_SECRET missing");
    process.exit(1);
  }

  const user = {
    id: "test-oauth-user-id",
    email: "test@privaterelay.appleid.com",
    name: "apple_user",
    role: "user" as const,
  };

  const chunks = await buildNextAuthSessionCookieChunks(user);
  console.log("secure cookies:", nextAuthUseSecureCookies());
  console.log("cookie names:", chunks.map((c) => c.name));

  const payload = await decode({
    token: chunks[0]?.value,
    secret,
  });

  console.log("decoded sub:", payload?.sub);
  console.log("decoded email:", payload?.email);
  console.log("decoded exp:", payload?.exp);

  if (payload?.sub !== user.id) {
    console.error("FAIL: sub mismatch");
    process.exit(1);
  }
  if (typeof payload?.exp === "number" && payload.exp < Date.now() / 1000) {
    console.error("FAIL: token already expired");
    process.exit(1);
  }
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
