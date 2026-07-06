import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  processLayawayMaintenance: vi
    .fn()
    .mockResolvedValue({ overdueCandidates: 0, defaulted: 0, defaultFailures: 0 }),
  reportCronAnomaly: vi.fn(),
}));

vi.mock("@/services/layaway", () => ({
  processLayawayMaintenance: hoisted.processLayawayMaintenance,
}));

vi.mock("@/lib/cron-anomaly-alert", () => ({
  reportCronAnomaly: hoisted.reportCronAnomaly,
}));

import { POST } from "@/app/api/cron/layaway/route";

function buildRequest(authorization?: string) {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new Request("http://localhost/api/cron/layaway", { method: "POST", headers });
}

describe("POST /api/cron/layaway auth gate", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    delete process.env.CRON_SECRET;
  });

  it("rejects with 503 in production when CRON_SECRET is unset (regression: must fail closed, not run unauthenticated)", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await POST(buildRequest());

    expect(res.status).toBe(503);
    expect(hoisted.processLayawayMaintenance).not.toHaveBeenCalled();
  });

  it("rejects with 401 when a secret is configured but the bearer token does not match", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CRON_SECRET = "s3cr3t";

    const res = await POST(buildRequest("Bearer wrong"));

    expect(res.status).toBe(401);
    expect(hoisted.processLayawayMaintenance).not.toHaveBeenCalled();
  });

  it("runs when the bearer token matches CRON_SECRET", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CRON_SECRET = "s3cr3t";

    const res = await POST(buildRequest("Bearer s3cr3t"));

    expect(res.status).toBe(200);
    expect(hoisted.processLayawayMaintenance).toHaveBeenCalled();
  });

  it("runs outside production even when CRON_SECRET is unset", async () => {
    vi.stubEnv("NODE_ENV", "test");

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(hoisted.processLayawayMaintenance).toHaveBeenCalled();
  });
});

// Regression: per-layaway default failures were individually swallowed with no aggregate
// alerting — a systemic failure could silently default 0 of N overdue layaways every day with
// no Sentry event (performance audit 2026-07).
describe("POST /api/cron/layaway anomaly alerting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("alerts when some overdue layaways failed to default", async () => {
    hoisted.processLayawayMaintenance.mockResolvedValue({
      overdueCandidates: 5,
      defaulted: 3,
      defaultFailures: 2,
    });
    await POST(buildRequest());
    expect(hoisted.reportCronAnomaly).toHaveBeenCalledWith(
      "layaway-maintenance",
      expect.stringContaining("2 of 5"),
    );
  });

  it("does not alert on a normal run with no failures", async () => {
    hoisted.processLayawayMaintenance.mockResolvedValue({
      overdueCandidates: 5,
      defaulted: 5,
      defaultFailures: 0,
    });
    await POST(buildRequest());
    expect(hoisted.reportCronAnomaly).not.toHaveBeenCalled();
  });
});
