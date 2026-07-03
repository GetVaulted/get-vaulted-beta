/**
 * Create beta admin2qa account and verify via Playwright UI login.
 * Beta project xkaaicokjgmpbctfermj only.
 *
 * Usage (from web/):
 *   npx tsx scripts/provision-beta-admin2qa.ts
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const EMAIL = "admin2qa@getvaultedtest.com";
const USERNAME = "admin2qa";
const PASSWORD = "BetaAdmin123!";
const EXPECTED_BETA_PROJECT_REF = "xkaaicokjgmpbctfermj";
const BETA_BASE = "https://beta.shopgetvaulted.com";

async function findAuthUserByEmail(
  admin: import("@supabase/supabase-js").SupabaseClient,
  email: string,
) {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw new Error(error.message);
    const users = data.users ?? [];
    const hit = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (users.length < 500) return null;
    page += 1;
  }
}

async function provisionAdmin() {
  const { createClient } = await import("@supabase/supabase-js");
  const { resolveDatabaseUrl, supabaseProjectRefFromUrl } = await import("../src/lib/resolve-database-url");
  const { findProductionHostEnvVar } = await import("../src/lib/production-host-guard");
  const { prisma } = await import("../src/lib/prisma");

  // Beta and production share the same Supabase project ref, so the ref check below cannot
  // distinguish them. This creates an account with a hardcoded password — check the site-URL
  // env vars first and refuse outright if this looks like production.
  const prodHostVar = findProductionHostEnvVar();
  if (prodHostVar) {
    throw new Error(
      `Refusing: ${prodHostVar} looks like the production domain. This script never runs against production.`,
    );
  }

  const dbRef = supabaseProjectRefFromUrl(resolveDatabaseUrl());
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const supaRef = supabaseProjectRefFromUrl(supabaseUrl);

  if (dbRef !== EXPECTED_BETA_PROJECT_REF || supaRef !== EXPECTED_BETA_PROJECT_REF) {
    throw new Error(`Refusing: must target beta project ${EXPECTED_BETA_PROJECT_REF}`);
  }
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let authUser = await findAuthUserByEmail(adminClient, EMAIL);
  if (authUser) {
    const { data, error } = await adminClient.auth.admin.updateUserById(authUser.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { username: USERNAME, display_name: "Admin2 QA" },
    });
    if (error) throw new Error(`updateUserById: ${error.message}`);
    authUser = data.user;
    console.log("Updated existing Supabase Auth user");
  } else {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { username: USERNAME, display_name: "Admin2 QA" },
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    authUser = data.user!;
    console.log("Created Supabase Auth user");
  }

  if (!authUser?.id) throw new Error("No auth user id");

  const authId = authUser.id;
  const byEmail = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: "insensitive" } },
  });
  const byId = await prisma.user.findUnique({ where: { id: authId } });

  if (byEmail && byEmail.id !== authId) {
    await prisma.user.delete({ where: { id: byEmail.id } });
    console.log("Removed stale Prisma row (id mismatch)");
  }

  if (byId) {
    await prisma.user.update({
      where: { id: authId },
      data: {
        email: EMAIL.toLowerCase(),
        username: USERNAME,
        name: "Admin2 QA",
        role: "admin",
        emailVerified: new Date(),
        suspendedAt: null,
      },
    });
    console.log("Updated Prisma admin user");
  } else {
    await prisma.user.create({
      data: {
        id: authId,
        email: EMAIL.toLowerCase(),
        username: USERNAME,
        name: "Admin2 QA",
        role: "admin",
        emailVerified: new Date(),
      },
    });
    console.log("Created Prisma admin user");
  }

  const row = await prisma.user.findUnique({
    where: { id: authId },
    select: { id: true, email: true, username: true, role: true, emailVerified: true },
  });
  console.log("Prisma row:", JSON.stringify(row, null, 2));
  await prisma.$disconnect();
  return authId;
}

async function verifyPlaywright() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("Playwright not installed — run: npx playwright install chromium");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let loginStatus = 0;
  let loginBody = "";
  page.on("response", async (res) => {
    if (res.url().includes("/api/auth/callback/credentials")) {
      loginStatus = res.status();
      loginBody = await res.text().catch(() => "");
    }
  });

  await page.goto(`${BETA_BASE}/signin`, { waitUntil: "networkidle" });
  await page.locator("#signin-email").fill(EMAIL);
  await page.locator("#signin-password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);

  const uiError = await page.locator("form p.text-rose-300").textContent().catch(() => null);
  const afterLoginUrl = page.url();

  const adminNav = page.goto(`${BETA_BASE}/admin`, { waitUntil: "domcontentloaded" });
  const adminRes = await adminNav;
  const adminStatus = adminRes?.status() ?? 0;
  const adminUrl = page.url();

  const apiRes = await page.request.get(`${BETA_BASE}/api/admin/users?limit=1`);
  const sessionRes = await page.request.get(`${BETA_BASE}/api/auth/session`);
  const session = await sessionRes.json().catch(() => ({}));

  await browser.close();

  return {
    loginStatus,
    loginBody,
    uiError,
    afterLoginUrl,
    adminStatus,
    adminUrl,
    apiStatus: apiRes.status(),
    session,
  };
}

async function main() {
  console.log("\n=== Provision admin2qa @ beta ===\n");
  await provisionAdmin();

  console.log("\n=== Playwright UI verification ===\n");
  const v = await verifyPlaywright();

  console.log("1. Sign-in POST /api/auth/callback/credentials:", v.loginStatus);
  console.log("   Response body:", v.loginBody);
  console.log("   UI error:", v.uiError ?? "(none)");
  console.log("2. After login URL:", v.afterLoginUrl);
  console.log("3. GET /admin HTTP:", v.adminStatus, "| URL:", v.adminUrl);
  console.log("4. GET /api/admin/users HTTP:", v.apiStatus);
  console.log("   Session:", JSON.stringify(v.session, null, 2));

  console.log("\n=== Confirmed credentials ===");
  console.log(`Email:    ${EMAIL}`);
  console.log(`Username: ${USERNAME} (display only — sign in with email)`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Admin:    ${BETA_BASE}/admin`);
  console.log(`Project:  ${EXPECTED_BETA_PROJECT_REF}`);

  const ok =
    v.loginStatus === 200 &&
    !v.uiError &&
    v.adminUrl.includes("/admin") &&
    v.adminStatus === 200 &&
    v.apiStatus === 200 &&
    v.session?.user?.role === "admin";

  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
