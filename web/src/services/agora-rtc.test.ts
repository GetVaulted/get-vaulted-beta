import { afterEach, describe, expect, it } from "vitest";
import {
  agoraChannelName,
  agoraHostUid,
  createAgoraHostSession,
  createAgoraViewerSession,
  getAgoraConfig,
  isAgoraConfigured,
} from "./agora-rtc";

const ENV_VARS = {
  AGORA_APP_ID: "0123456789abcdef0123456789abcdef",
  AGORA_APP_CERTIFICATE: "fedcba9876543210fedcba9876543210",
};

function setEnv(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => {
  setEnv({ AGORA_APP_ID: undefined, AGORA_APP_CERTIFICATE: undefined });
});

describe("agora config", () => {
  it("needs only the App ID and App Certificate", () => {
    expect(isAgoraConfigured()).toBe(false);
    setEnv({ AGORA_APP_ID: ENV_VARS.AGORA_APP_ID });
    expect(getAgoraConfig()).toBeNull();
    setEnv(ENV_VARS);
    expect(getAgoraConfig()).toEqual({
      appId: ENV_VARS.AGORA_APP_ID,
      appCertificate: ENV_VARS.AGORA_APP_CERTIFICATE,
    });
    expect(isAgoraConfigured()).toBe(true);
  });
});

describe("channel and uid", () => {
  it("derives a stable channel name and a valid 32-bit uid per room", () => {
    expect(agoraChannelName("room_abc")).toBe("gv-room_abc");
    expect(agoraChannelName("x".repeat(100)).length).toBeLessThanOrEqual(63);
    const a = agoraHostUid("room_abc");
    expect(agoraHostUid("room_abc")).toBe(a);
    expect(agoraHostUid("room_other")).not.toBe(a);
    expect(a).toBeGreaterThanOrEqual(1);
    expect(a).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("host session token", () => {
  it("mints a signed publisher token bound to the room's channel and uid", () => {
    setEnv(ENV_VARS);
    const session = createAgoraHostSession("room_abc");
    expect(session.appId).toBe(ENV_VARS.AGORA_APP_ID);
    expect(session.channel).toBe("gv-room_abc");
    expect(session.uid).toBe(agoraHostUid("room_abc"));
    expect(session.token.startsWith("007")).toBe(true);
    expect(session.expiresInSeconds).toBe(12 * 60 * 60);
  });

  it("refuses to mint without configuration", () => {
    expect(() => createAgoraHostSession("room_abc")).toThrow(/not configured/);
    expect(() => createAgoraViewerSession("room_abc")).toThrow(/not configured/);
  });
});

describe("viewer session token", () => {
  it("mints a subscribe-only pass for the same channel and tells the player which uid is the host", () => {
    setEnv(ENV_VARS);
    const viewer = createAgoraViewerSession("room_abc");
    expect(viewer.appId).toBe(ENV_VARS.AGORA_APP_ID);
    expect(viewer.channel).toBe("gv-room_abc");
    expect(viewer.hostUid).toBe(agoraHostUid("room_abc"));
    expect(viewer.uid).toBe(0);
    expect(viewer.token.startsWith("007")).toBe(true);
    expect(viewer.expiresInSeconds).toBe(2 * 60 * 60);
    // A viewer pass is a different token from the host's publish token.
    expect(viewer.token).not.toBe(createAgoraHostSession("room_abc").token);
  });

  it("never contains the certificate", () => {
    setEnv(ENV_VARS);
    expect(JSON.stringify(createAgoraViewerSession("room_abc"))).not.toContain(ENV_VARS.AGORA_APP_CERTIFICATE);
  });
});
