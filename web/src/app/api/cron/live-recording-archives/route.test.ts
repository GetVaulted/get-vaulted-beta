import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  reconcile: vi.fn(),
  report: vi.fn(),
}));

vi.mock("@/lib/cron-anomaly-alert", () => ({
  reportCronAnomaly: hoisted.report,
}));

vi.mock("@/lib/trust/live-recording-s3", () => ({
  reconcilePreparingReplayArchives: hoisted.reconcile,
}));

import { POST } from "@/app/api/cron/live-recording-archives/route";

function req(headers?: HeadersInit) {
  return new Request("http://localhost/api/cron/live-recording-archives", { method: "POST", headers });
}

describe("POST /api/cron/live-recording-archives auth gate", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    hoisted.reconcile.mockResolvedValue({ packed: 1, failed: 0 });
  });

  it("rejects with 503 in production when CRON_SECRET is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await POST(req());
    expect(res.status).toBe(503);
  });

  it("rejects wrong bearer", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await POST(req({ Authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
    delete process.env.CRON_SECRET;
  });

  it("runs when the bearer token matches CRON_SECRET", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await POST(req({ Authorization: "Bearer s3cr3t" }));
    expect(res.status).toBe(200);
    expect(hoisted.reconcile).toHaveBeenCalled();
    delete process.env.CRON_SECRET;
  });

  it("runs outside production even when CRON_SECRET is unset", async () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.CRON_SECRET;
    const res = await POST(req());
    expect(res.status).toBe(200);
  });
});
