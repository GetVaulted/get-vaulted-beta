/**
 * Diagnose and repair beta admin QA account (adminqa@getvaultedtest.com).
 * Beta Supabase project xkaaicokjgmpbctfermj only.
 *
 * Usage (from web/):
 *   npx tsx scripts/fix-beta-admin-qa.ts
 *   npx tsx scripts/fix-beta-admin-qa.ts --verify-only
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const BETA_QA_ADMIN_EMAIL = "adminqa@getvaultedtest.com";
const BETA_QA_ADMIN_USERNAME = "adminqa";
const ADMIN_BETA_PASSWORD = "AdminBeta123!";
const SELLER_BUYER_PASSWORD = "VaultedBetaQA1!";
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

async function testSupabasePassword(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<{ ok: boolean; error: string | null; userId: string | null }> {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: email.toLowerCase(),
    password,
  });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "no user", userId: null };
  }
  return { ok: true, error: null, userId: data.user.id };
}

function createJar() {
  const jar = new Map<string, string>();
  return {
    absorb(res: Response) {
      let list: string[] = [];
      if (typeof res.headers.getSetCookie === "function") list = res.headers.getSetCookie();
      else {
        const c = res.headers.get("set-cookie");
        if (c) list = c.split(/,(?=[^;]+?=)/).map((s) => s.trim());
      }
      for (const line of list) {
        const nv = line.split(";")[0];
        const eq = nv.indexOf("=");
        if (eq === -1) continue;
        jar.set(nv.slice(0, eq).trim(), nv.slice(eq + 1).trim());
      }
    },
    header() {
      return Array.from(jar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    },
    clear() {
      jar.clear();
    },
  };
}

async function signInWeb(email: string, password: string) {
  const jar = createJar();
  const csrfRes = await fetch(`${BETA_BASE}/api/auth/csrf`, { headers: { cookie: jar.header() } });
  jar.absorb(csrfRes);
  const csrfJson = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({
    csrfToken: csrfJson.csrfToken,
    email,
    password,
    callbackUrl: `${BETA_BASE}/admin`,
    json: "true",
    redirect: "false",
  });
  const loginRes = await fetch(`${BETA_BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: jar.header() },
    body: body.toString(),
  });
  jar.absorb(loginRes);
  const json = (await loginRes.json().catch(() => ({}))) as { url?: string; error?: string };
  return { jar, loginStatus: loginRes.status, loginJson: json };
}

async function main() {
  const verifyOnly = process.argv.includes("--verify-only");
  const password = ADMIN_BETA_PASSWORD;

  const { createClient } = await import("@supabase/supabase-js");
  const { resolveDatabaseUrl, supabaseProjectRefFromUrl } = await import("../src/lib/resolve-database-url");
  const { findProductionHostEnvVar } = await import("../src/lib/production-host-guard");
  const { prisma } = await import("../src/lib/prisma");

  // Beta and production share the same Supabase project ref, so the ref check below cannot
  // distinguish them. This resets an account to a hardcoded password — check the site-URL env
  // vars first and refuse outright if this looks like production.
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
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? process.env.SUPABASE_ANON_KEY?.trim() ?? "";
  const supaRef = supabaseProjectRefFromUrl(supabaseUrl);

  if (dbRef !== EXPECTED_BETA_PROJECT_REF || supaRef !== EXPECTED_BETA_PROJECT_REF) {
    throw new Error(`Refusing: must target beta project ${EXPECTED_BETA_PROJECT_REF}`);
  }
  if (!serviceKey || !anonKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY");
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("\n=== Beta admin QA diagnosis ===\n");

  let authUser = await findAuthUserByEmail(adminClient, BETA_QA_ADMIN_EMAIL);
  console.log("1. Supabase Auth user:", authUser ? `exists id=${authUser.id}` : "MISSING");
  if (authUser) {
    console.log(`   email: ${authUser.email}`);
    console.log(`   email_confirmed_at: ${authUser.email_confirmed_at ?? "(null)"}`);
    console.log(`   banned_until: ${authUser.banned_until ?? "(null)"}`);
  }

  const prismaUser = await prisma.user.findFirst({
    where: { email: { equals: BETA_QA_ADMIN_EMAIL, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      suspendedAt: true,
      emailVerified: true,
    },
  });
  console.log("2. Prisma User row:", prismaUser ? `exists id=${prismaUser.id}` : "MISSING");
  if (prismaUser) {
    console.log(`   email: ${prismaUser.email}`);
    console.log(`   username: ${prismaUser.username}`);
    console.log(`   role: ${prismaUser.role}`);
    console.log(`   emailVerified: ${prismaUser.emailVerified?.toISOString() ?? "(null)"}`);
    console.log(`   suspendedAt: ${prismaUser.suspendedAt?.toISOString() ?? "(null)"}`);
  }

  console.log("3. role === admin:", prismaUser?.role === "admin" ? "yes" : "NO");
  console.log(
    "4. Auth email matches Prisma email:",
    authUser && prismaUser
      ? authUser.email?.toLowerCase() === prismaUser.email.toLowerCase()
        ? "yes"
        : "NO — mismatch"
      : "n/a",
  );
  console.log(
    "5. Auth id matches Prisma id:",
    authUser && prismaUser ? (authUser.id === prismaUser.id ? "yes" : "NO — mismatch") : "n/a",
  );

  let passwordTest = await testSupabasePassword(supabaseUrl, anonKey, BETA_QA_ADMIN_EMAIL, password);
  console.log(
    "6. Supabase signInWithPassword:",
    passwordTest.ok ? `OK userId=${passwordTest.userId}` : `FAIL — ${passwordTest.error}`,
  );

  if (!verifyOnly) {
    let repaired = false;

    if (!authUser) {
      const { data, error } = await adminClient.auth.admin.createUser({
        email: BETA_QA_ADMIN_EMAIL,
        password,
        email_confirm: true,
        user_metadata: { username: BETA_QA_ADMIN_USERNAME, display_name: "Admin QA" },
      });
      if (error) throw new Error(`createUser: ${error.message}`);
      authUser = data.user!;
      console.log("\n→ Created Supabase Auth user");
      repaired = true;
    } else {
      const { data, error } = await adminClient.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
        user_metadata: { username: BETA_QA_ADMIN_USERNAME, display_name: "Admin QA" },
      });
      if (error) throw new Error(`updateUserById: ${error.message}`);
      authUser = data.user;
      console.log("\n→ Reset Supabase Auth password + confirmed email");
      repaired = true;
    }

    if (!authUser) throw new Error("Auth user missing after repair");

    const authId = authUser.id;
    if (!prismaUser) {
      await prisma.user.create({
        data: {
          id: authId,
          email: BETA_QA_ADMIN_EMAIL.toLowerCase(),
          username: BETA_QA_ADMIN_USERNAME,
          name: "Admin QA",
          role: "admin",
          emailVerified: new Date(),
        },
      });
      console.log("→ Created Prisma admin user");
      repaired = true;
    } else if (prismaUser.id !== authId) {
      // Orphan row with wrong id — repoint by deleting stale row if safe, else update email on old and create new
      const otherById = await prisma.user.findUnique({ where: { id: authId } });
      if (otherById && otherById.email.toLowerCase() !== BETA_QA_ADMIN_EMAIL.toLowerCase()) {
        throw new Error(`Prisma id ${authId} already used by ${otherById.email}`);
      }
      if (prismaUser.username === BETA_QA_ADMIN_USERNAME) {
        await prisma.user.delete({ where: { id: prismaUser.id } });
        console.log(`→ Removed stale Prisma row (id mismatch was ${prismaUser.id})`);
      }
      if (!otherById) {
        await prisma.user.create({
          data: {
            id: authId,
            email: BETA_QA_ADMIN_EMAIL.toLowerCase(),
            username: BETA_QA_ADMIN_USERNAME,
            name: "Admin QA",
            role: "admin",
            emailVerified: new Date(),
          },
        });
        console.log("→ Created Prisma user aligned to Supabase auth id");
      } else {
        await prisma.user.update({
          where: { id: authId },
          data: {
            email: BETA_QA_ADMIN_EMAIL.toLowerCase(),
            username: BETA_QA_ADMIN_USERNAME,
            role: "admin",
            emailVerified: new Date(),
            suspendedAt: null,
          },
        });
        console.log("→ Updated Prisma user at auth id");
      }
      repaired = true;
    } else {
      await prisma.user.update({
        where: { id: authId },
        data: {
          email: BETA_QA_ADMIN_EMAIL.toLowerCase(),
          username: BETA_QA_ADMIN_USERNAME,
          role: "admin",
          emailVerified: new Date(),
          suspendedAt: null,
        },
      });
      console.log("→ Ensured Prisma role=admin, emailVerified, not suspended");
      repaired = true;
    }

    if (repaired) {
      passwordTest = await testSupabasePassword(supabaseUrl, anonKey, BETA_QA_ADMIN_EMAIL, password);
      console.log(
        "\nPost-repair Supabase signInWithPassword:",
        passwordTest.ok ? "OK" : `FAIL — ${passwordTest.error}`,
      );
    }
  }

  console.log("\n=== Deployed beta web login verification ===\n");

  const adminLogin = await signInWeb(BETA_QA_ADMIN_EMAIL, password);
  console.log(`adminqa web sign-in: HTTP ${adminLogin.loginStatus}`, adminLogin.loginJson.url ? "OK" : adminLogin.loginJson);

  let adminChecks = { panel: 0, api: 0, role: "(none)" };
  if (adminLogin.loginStatus === 200 && adminLogin.loginJson.url) {
    const sessionRes = await fetch(`${BETA_BASE}/api/auth/session`, {
      headers: { cookie: adminLogin.jar.header() },
    });
    const sessionJson = (await sessionRes.json()) as { user?: { role?: string } };
    adminChecks.role = sessionJson.user?.role ?? "(none)";

    const panelRes = await fetch(`${BETA_BASE}/admin`, {
      redirect: "manual",
      headers: { cookie: adminLogin.jar.header() },
    });
    adminChecks.panel = panelRes.status;

    const apiRes = await fetch(`${BETA_BASE}/api/admin/users?limit=1`, {
      headers: { cookie: adminLogin.jar.header() },
    });
    adminChecks.api = apiRes.status;
    console.log(`  session.role: ${adminChecks.role}`);
    console.log(`  GET /admin: HTTP ${adminChecks.panel}`);
    console.log(`  GET /api/admin/users: HTTP ${adminChecks.api}`);
  }

  for (const email of ["sellerqa@getvaultedtest.com", "buyerqa@getvaultedtest.com"]) {
    const login = await signInWeb(email, SELLER_BUYER_PASSWORD);
    if (login.loginStatus !== 200 || !login.loginJson.url) {
      console.log(`${email}: sign-in failed HTTP ${login.loginStatus}`);
      continue;
    }
    const panelRes = await fetch(`${BETA_BASE}/admin`, {
      redirect: "manual",
      headers: { cookie: login.jar.header() },
    });
    const apiRes = await fetch(`${BETA_BASE}/api/admin/users?limit=1`, {
      headers: { cookie: login.jar.header() },
    });
    console.log(`${email}: GET /admin → ${panelRes.status}, GET /api/admin/users → ${apiRes.status}`);
  }

  console.log("\n=== Credentials ===");
  console.log(`Email:    ${BETA_QA_ADMIN_EMAIL}`);
  console.log(`Password: ${password}`);
  console.log(`Project:  ${EXPECTED_BETA_PROJECT_REF} (beta only)`);

  const ok =
    passwordTest.ok &&
    adminLogin.loginStatus === 200 &&
    Boolean(adminLogin.loginJson.url) &&
    adminChecks.panel === 200 &&
    adminChecks.api === 200 &&
    adminChecks.role === "admin";

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
