import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureMessage }));

import { reportCronAnomaly } from "./cron-anomaly-alert";

describe("reportCronAnomaly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports via Sentry.captureMessage when SENTRY_DSN is configured", () => {
    vi.stubEnv("SENTRY_DSN", "https://examplePublicKey@o0.ingest.sentry.io/0");
    reportCronAnomaly("payout-tier", "processed 0 of 400 candidate sellers");
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("payout-tier: processed 0 of 400 candidate sellers"),
      "warning",
    );
  });

  it("falls back to console.warn when Sentry is not configured", () => {
    vi.stubEnv("SENTRY_DSN", "");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportCronAnomaly("layaway-maintenance", "2 of 5 overdue layaways failed to default");
    expect(captureMessage).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("layaway-maintenance: 2 of 5 overdue layaways failed to default"),
    );
    warnSpy.mockRestore();
  });
});
