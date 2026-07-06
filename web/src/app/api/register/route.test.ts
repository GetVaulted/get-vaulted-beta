import { describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/register-validate-username", () => ({
  validateUsernameForRegistration: vi.fn(),
}));
vi.mock("@/lib/register-via-supabase-auth", () => ({
  registerAccountViaSupabaseAuth: vi.fn(),
}));

import { POST } from "@/app/api/register/route";

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Bug fix (2026-07): password strength was only checked for length (>=8). Now also requires at
// least one letter and one number, mirroring the client-side check in SignupForm.tsx — but no
// special characters or mixed case, since that would add signup friction without much benefit.
describe("POST /api/register — password strength", () => {
  it("rejects a password shorter than 8 characters", async () => {
    const res = await POST(buildRequest({ email: "a@example.com", username: "someuser", password: "ab1" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_PASSWORD");
  });

  it("rejects an 8+ character password with no digits", async () => {
    const res = await POST(
      buildRequest({ email: "a@example.com", username: "someuser", password: "lettersonly" }),
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_PASSWORD");
  });

  it("rejects an 8+ character password with no letters", async () => {
    const res = await POST(buildRequest({ email: "a@example.com", username: "someuser", password: "12345678" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_PASSWORD");
  });

  it("does NOT require special characters or mixed case", async () => {
    const { validateUsernameForRegistration } = await import("@/lib/register-validate-username");
    vi.mocked(validateUsernameForRegistration).mockResolvedValue({
      ok: false,
      reason: "taken",
      message: "That username is already taken.",
    });
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await POST(buildRequest({ email: "a@example.com", username: "someuser", password: "password1" }));
    const json = await res.json();

    // Password passes the strength gate, so the request proceeds past it and fails on the next
    // check instead (username taken) — proving the password itself was never the blocker here.
    expect(json.code).not.toBe("INVALID_PASSWORD");
  });

  it("accepts a normal 8+ char password containing a letter and a number", async () => {
    const { validateUsernameForRegistration } = await import("@/lib/register-validate-username");
    vi.mocked(validateUsernameForRegistration).mockResolvedValue({
      ok: false,
      reason: "taken",
      message: "That username is already taken.",
    });
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await POST(buildRequest({ email: "a@example.com", username: "someuser", password: "goldrush7" }));
    const json = await res.json();

    expect(json.code).not.toBe("INVALID_PASSWORD");
  });
});
