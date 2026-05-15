/**
 * HTTP smoke test for signup → verify-email → credentials session (NextAuth).
 * Run with dev server: npm run dev, then: node scripts/signup-verify-flow-smoke.mjs
 */
const base = process.env.SMOKE_BASE_URL || "http://localhost:3000";

const jar = new Map();

function absorbCookies(res) {
  let list = [];
  if (typeof res.headers.getSetCookie === "function") {
    list = res.headers.getSetCookie();
  } else {
    const c = res.headers.get("set-cookie");
    if (c) list = c.split(/,(?=[^;]+?=)/).map((s) => s.trim());
  }
  for (const line of list) {
    const nv = line.split(";")[0];
    const eq = nv.indexOf("=");
    if (eq === -1) continue;
    const name = nv.slice(0, eq).trim();
    const value = nv.slice(eq + 1).trim();
    jar.set(name, value);
  }
}

function cookieHeader() {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function getCsrf() {
  const r = await fetch(`${base}/api/auth/csrf`, {
    headers: { cookie: cookieHeader() },
  });
  absorbCookies(r);
  const j = await r.json();
  if (!j.csrfToken) throw new Error("No csrfToken from /api/auth/csrf");
  return j.csrfToken;
}

async function postCredentials(email, password) {
  const csrf = await getCsrf();
  const body = new URLSearchParams({
    csrfToken: csrf,
    email,
    password,
    callbackUrl: `${base}/marketplace`,
    json: "true",
    redirect: "false",
  });
  const r = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
    },
    body: body.toString(),
  });
  absorbCookies(r);
  let json = {};
  try {
    json = JSON.parse(await r.text());
  } catch {
    /* ignore */
  }
  return { status: r.status, json };
}

async function getSession() {
  const r = await fetch(`${base}/api/auth/session`, {
    headers: { cookie: cookieHeader() },
  });
  return r.json();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const stamp = Date.now();
  const email = `smoke_verify_${stamp}@test.internal`;
  const username = `smokev${stamp}`.slice(0, 20);
  const password = "smoke-pass-verify-99";

  console.log("\n=== 1) Register new account ===\n");
  const regRes = await fetch(`${base}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password }),
  });
  const regJson = await regRes.json();
  console.log("POST /api/register status:", regRes.status, regJson);

  assert(regRes.ok, `register failed: ${JSON.stringify(regJson)}`);

  const devCode = regJson._localDevVerificationCode;
  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  if (devCode) {
    console.log("\n[Local dev] Code returned in JSON body (_localDevVerificationCode) — no email sent without RESEND_API_KEY.");
  } else if (hasResend) {
    console.log("\n[Resend] Email send attempted; code is NOT in JSON (check inbox / Resend dashboard).");
    console.log("Set RESEND_API_KEY empty for local JSON code path, or read code from email.");
  } else {
    console.log("\nNote: no _localDevVerificationCode and no RESEND_API_KEY — cannot continue automated verify.");
    process.exitCode = 1;
    return;
  }

  const plainCode = devCode || regJson.code;
  assert(plainCode && String(plainCode).length === 6, "expected 6-digit code from register response");

  console.log("\n=== 2) Invalid code (before success) ===\n");
  const bad = await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code: "000000" }),
  });
  const badJson = await bad.json();
  console.log("wrong code status:", bad.status, badJson);
  assert(bad.status === 400 && badJson.code === "INVALID_CODE", "expected INVALID_CODE");

  console.log("\n=== 3) Verify with correct code ===\n");
  const ok = await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code: String(plainCode) }),
  });
  const okJson = await ok.json();
  console.log("verify status:", ok.status, okJson);
  assert(ok.ok && okJson.ok === true, "verify failed");

  console.log("\n=== 4) Same code after verify (idempotent; OTP row already consumed) ===\n");
  const again = await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code: String(plainCode) }),
  });
  const againJson = await again.json();
  console.log("reuse status:", again.status, againJson);
  assert(again.status === 200 && againJson.ok === true && againJson.alreadyVerified === true, "expected alreadyVerified");

  console.log("\n=== 5) Credentials sign-in + session ===\n");
  jar.clear();
  const sign = await postCredentials(email, password);
  console.log("callback/credentials:", sign.status, sign.json);
  assert(sign.status === 200 && sign.json?.url, "sign-in expected 200 with url");

  const sess = await getSession();
  console.log("GET /api/auth/session:", JSON.stringify(sess));
  assert(sess?.user?.email === email, "session email mismatch");

  console.log("\n=== 6) Existing backfilled user sign-in (if env set) ===\n");
  const legacyEmail = process.env.SMOKE_LEGACY_EMAIL?.trim();
  const legacyPassword = process.env.SMOKE_LEGACY_PASSWORD?.trim();
  if (legacyEmail && legacyPassword) {
    jar.clear();
    const leg = await postCredentials(legacyEmail, legacyPassword);
    const legSess = await getSession();
    console.log("legacy sign-in status:", leg.status, "session user:", legSess?.user?.email);
    assert(leg.status === 200 && legSess?.user?.email === legacyEmail, "legacy user sign-in failed");
  } else {
    console.log("Skip (set SMOKE_LEGACY_EMAIL + SMOKE_LEGACY_PASSWORD to test an existing DB user).");
  }

  console.log("\n=== All automated checks passed ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
