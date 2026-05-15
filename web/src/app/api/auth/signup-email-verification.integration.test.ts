import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedUser,
  SEED_USER_PLAINTEXT_PASSWORD,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

type PostRegister = (req: Request) => Promise<Response>;
type PostJson = (req: Request) => Promise<Response>;

const g = globalThis as unknown as {
  __signupReg?: PostRegister;
  __signupVer?: PostJson;
  __signupRes?: PostJson;
};

describe("signup + email verification API", () => {
  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RESEND_API_KEY", "");
    await bootstrapIntegrationPrisma();
    const registerRoute = await import("@/app/api/register/route");
    const verifyRoute = await import("@/app/api/auth/verify-email/route");
    const resendRoute = await import("@/app/api/auth/resend-verification/route");
    g.__signupReg = registerRoute.POST;
    g.__signupVer = verifyRoute.POST;
    g.__signupRes = resendRoute.POST;
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  it("register returns dev code; invalid verify; verify ok; single-use; credentials authorize", async () => {
    const POSTreg = g.__signupReg!;
    const POSTver = g.__signupVer!;

    const stamp = Date.now();
    const email = `signup_${stamp}@test.internal`;
    const username = `su${stamp}`.slice(0, 20);
    const password = "integration-pass-99";

    const reg = await POSTreg(
      new Request("http://localhost/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      }),
    );
    expect(reg.status).toBe(200);
    const regJson = (await reg.json()) as { ok?: boolean; _localDevVerificationCode?: string };
    expect(regJson.ok).toBe(true);
    expect(regJson._localDevVerificationCode).toMatch(/^\d{6}$/);
    const code = regJson._localDevVerificationCode!;

    const bad = await POSTver(
      new Request("http://localhost/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: "000000" }),
      }),
    );
    expect(bad.status).toBe(400);
    const badJ = (await bad.json()) as { code?: string };
    expect(badJ.code).toBe("INVALID_CODE");

    const ok = await POSTver(
      new Request("http://localhost/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      }),
    );
    expect(ok.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.emailVerified).not.toBeNull();

    const reuse = await POSTver(
      new Request("http://localhost/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      }),
    );
    expect(reuse.status).toBe(200);
    const reuseJ = (await reuse.json()) as { ok?: boolean; alreadyVerified?: boolean };
    expect(reuseJ.ok).toBe(true);
    expect(reuseJ.alreadyVerified).toBe(true);

    const consumed = await prisma.emailVerificationCode.count({
      where: { userId: user!.id, consumedAt: { not: null } },
    });
    expect(consumed).toBe(1);

    const cred = authOptions.providers[0];
    expect(cred?.type).toBe("credentials");
    const authorize = (
      cred as {
        options?: { authorize?: (c: unknown, r: unknown) => Promise<unknown> };
      }
    ).options?.authorize;
    expect(authorize).toBeTypeOf("function");
    const sessionUser = await authorize!(
      { email, password },
      // NextAuth passes a second arg; not used by our Credentials authorize implementation.
      {} as never,
    );
    expect(sessionUser).not.toBeNull();
    expect((sessionUser as { email?: string }).email).toBe(email);
  });

  it("returns EXPIRED_CODE when all pending codes are past expiry", async () => {
    const POSTreg = g.__signupReg!;
    const POSTver = g.__signupVer!;

    const stamp = Date.now();
    const email = `exp_${stamp}@test.internal`;
    const username = `ex${stamp}`.slice(0, 20);
    const password = "integration-pass-99";

    const reg = await POSTreg(
      new Request("http://localhost/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      }),
    );
    expect(reg.status).toBe(200);
    const regJson = (await reg.json()) as { _localDevVerificationCode?: string };
    const code = regJson._localDevVerificationCode!;

    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    expect(u?.id).toBeTruthy();
    await prisma.emailVerificationCode.updateMany({
      where: { userId: u!.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const expired = await POSTver(
      new Request("http://localhost/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      }),
    );
    expect(expired.status).toBe(400);
    const j = (await expired.json()) as { code?: string };
    expect(j.code).toBe("EXPIRED_CODE");
  });

  it("seedUser (backfilled-style verified) can use credentials authorize", async () => {
    await seedUser(prisma, { email: "legacy_seed@test.internal", username: "legacyseed" });
    const cred = authOptions.providers[0] as {
      options?: { authorize?: (c: unknown, r: unknown) => Promise<unknown> };
    };
    const sessionUser = await cred.options!.authorize!(
      { email: "legacy_seed@test.internal", password: SEED_USER_PLAINTEXT_PASSWORD },
      {} as never,
    );
    expect(sessionUser).not.toBeNull();
    expect((sessionUser as { email?: string }).email).toBe("legacy_seed@test.internal");
  });

  it("resend returns dev code in development without Resend", async () => {
    const POSTreg = g.__signupReg!;
    const POSTres = g.__signupRes!;

    const stamp = Date.now();
    const email = `rs_${stamp}@test.internal`;
    const username = `rs${stamp}`.slice(0, 20);
    const password = "integration-pass-99";

    await POSTreg(
      new Request("http://localhost/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      }),
    );

    const row = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    await prisma.emailVerificationCode.updateMany({
      where: { userId: row!.id },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });

    const res = await POSTres(
      new Request("http://localhost/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok?: boolean; _localDevVerificationCode?: string };
    expect(j.ok).toBe(true);
    expect(j._localDevVerificationCode).toMatch(/^\d{6}$/);
  });
});
