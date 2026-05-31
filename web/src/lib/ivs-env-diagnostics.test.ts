import { describe, expect, it, afterEach } from "vitest";
import { buildIvsEnvDiagnostics } from "@/lib/ivs-env-diagnostics";

describe("buildIvsEnvDiagnostics", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("reports VAULTED_AWS_* when set", () => {
    process.env.VAULTED_AWS_ACCESS_KEY_ID = "AKIATESTKEY123456";
    process.env.VAULTED_AWS_SECRET_ACCESS_KEY = "a".repeat(40);
    process.env.VAULTED_AWS_REGION = "us-east-1";
    process.env.CONTEXT = "production";

    const d = buildIvsEnvDiagnostics();
    expect(d.hasAccessKey).toBe(true);
    expect(d.hasSecretKey).toBe(true);
    expect(d.region).toBe("us-east-1");
    expect(d.deployContext).toBe("production");
    expect(d.credentialSource).toBe("VAULTED_AWS_*");
    expect(d.accessKeyPrefix).toBe("AKIA");
    expect(d.secretKeyLength).toBe(40);
  });

  it("prefers VAULTED_AWS_* over runtime AWS_* when both are set", () => {
    process.env.AWS_ACCESS_KEY_ID = "ASIARUNTIMEKEY123456789";
    process.env.AWS_SECRET_ACCESS_KEY = "b".repeat(40);
    process.env.VAULTED_AWS_ACCESS_KEY_ID = "AKIATESTKEY123456";
    process.env.VAULTED_AWS_SECRET_ACCESS_KEY = "a".repeat(40);
    process.env.VAULTED_AWS_REGION = "us-east-1";

    const d = buildIvsEnvDiagnostics();
    expect(d.credentialSource).toBe("VAULTED_AWS_*");
    expect(d.resolvedFrom).toBe("VAULTED_AWS_*");
    expect(d.accessKeyPrefix).toBe("AKIA");
    expect(d.region).toBe("us-east-1");
  });

  it("detects access without secret", () => {
    process.env.VAULTED_AWS_ACCESS_KEY_ID = "AKIATESTKEY123456";
    delete process.env.VAULTED_AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SECRET_ACCESS_KEY;

    const d = buildIvsEnvDiagnostics();
    expect(d.hasAccessKey).toBe(true);
    expect(d.hasSecretKey).toBe(false);
    expect(d.credentialSource).toBe("access_only_missing_secret");
  });
});
