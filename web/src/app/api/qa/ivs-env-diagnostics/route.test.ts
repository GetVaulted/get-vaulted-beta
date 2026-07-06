import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/qa/ivs-env-diagnostics/route";

describe("GET /api/qa/ivs-env-diagnostics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function req(host: string) {
    return new Request("http://x/api/qa/ivs-env-diagnostics", { headers: { host } });
  }

  it("is disabled by default (production-like env) regardless of Host header", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GV_ALLOW_QA_SESSION_DEBUG", undefined);

    const res = await GET(req("shopgetvaulted.com"));
    expect(res.status).toBe(404);
  });

  // Regression: a client-supplied Host header must never grant access to AWS credential
  // diagnostics — Host is fully attacker-controlled and previously bypassed auth entirely for
  // "beta.shopgetvaulted.com" / "*.netlify.app", leaking AWS access-key prefixes/lengths to any
  // anonymous visitor of the public beta deployment.
  it("does not grant access via a beta.shopgetvaulted.com Host header spoof", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GV_ALLOW_QA_SESSION_DEBUG", undefined);

    const res = await GET(req("beta.shopgetvaulted.com"));
    expect(res.status).toBe(404);
  });

  it("does not grant access via a *.netlify.app Host header spoof", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GV_ALLOW_QA_SESSION_DEBUG", undefined);

    const res = await GET(req("some-deploy-preview--getvaulted.netlify.app"));
    expect(res.status).toBe(404);
  });

  it("is allowed when GV_ALLOW_QA_SESSION_DEBUG=1 is explicitly set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GV_ALLOW_QA_SESSION_DEBUG", "1");

    const res = await GET(req("shopgetvaulted.com"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });

  it("is allowed in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GV_ALLOW_QA_SESSION_DEBUG", undefined);

    const res = await GET(req("localhost"));
    expect(res.status).toBe(200);
  });
});
