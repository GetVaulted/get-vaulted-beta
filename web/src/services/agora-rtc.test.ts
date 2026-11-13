import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agoraChannelName,
  agoraHostUid,
  createAgoraHostSession,
  getAgoraConfig,
  getAgoraRelay,
  isAgoraConfigured,
  joinRtmpUrl,
  startAgoraRelay,
  stopAgoraRelay,
} from "./agora-rtc";

const ENV_VARS = {
  AGORA_APP_ID: "0123456789abcdef0123456789abcdef",
  AGORA_APP_CERTIFICATE: "fedcba9876543210fedcba9876543210",
  AGORA_REST_CUSTOMER_ID: "cust-id",
  AGORA_REST_CUSTOMER_SECRET: "cust-secret",
};

function setEnv(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  setEnv({
    AGORA_APP_ID: undefined,
    AGORA_APP_CERTIFICATE: undefined,
    AGORA_REST_CUSTOMER_ID: undefined,
    AGORA_REST_CUSTOMER_SECRET: undefined,
    AGORA_REST_REGION: undefined,
  });
});

describe("agora config", () => {
  it("is null until every credential is set", () => {
    expect(isAgoraConfigured()).toBe(false);
    setEnv({ ...ENV_VARS, AGORA_REST_CUSTOMER_SECRET: undefined });
    expect(getAgoraConfig()).toBeNull();
    setEnv(ENV_VARS);
    expect(getAgoraConfig()).toMatchObject({ appId: ENV_VARS.AGORA_APP_ID, region: "na" });
    setEnv({ AGORA_REST_REGION: "EU" });
    expect(getAgoraConfig()?.region).toBe("eu");
    setEnv({ AGORA_REST_REGION: "bogus" });
    expect(getAgoraConfig()?.region).toBe("na");
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

  it("joins an RTMPS base and key with a single slash", () => {
    expect(joinRtmpUrl("rtmps://live.cloudflare.com:443/live/", "key123")).toBe(
      "rtmps://live.cloudflare.com:443/live/key123",
    );
    expect(joinRtmpUrl("rtmps://live.cloudflare.com:443/live", "/key123")).toBe(
      "rtmps://live.cloudflare.com:443/live/key123",
    );
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
  });
});

describe("media push relay", () => {
  it("creates an untranscoded converter pointing the host's stream at the RTMPS url", async () => {
    setEnv(ENV_VARS);
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ converter: { id: "conv-1", state: "connecting" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const relay = await startAgoraRelay({ roomId: "room_abc", rtmpUrl: "rtmps://live.cloudflare.com:443/live/key" });
    expect(relay).toEqual({ converterId: "conv-1", state: "connecting" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.agora.io/na/v1/projects/${ENV_VARS.AGORA_APP_ID}/rtmp-converters`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("cust-id:cust-secret").toString("base64")}`);
    const body = JSON.parse(String(init.body)) as { converter: Record<string, unknown> };
    expect(body.converter.rtmpUrl).toBe("rtmps://live.cloudflare.com:443/live/key");
    expect(body.converter.rawOptions).toEqual({ rtcChannel: "gv-room_abc", rtcStreamUid: agoraHostUid("room_abc") });
    expect(body.converter.transcodeOptions).toBeUndefined();
    expect(body.converter.idleTimeOut).toBe(300);
    expect(String(body.converter.name)).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it("surfaces Agora's error message", async () => {
    setEnv(ENV_VARS);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "rtmpUrl invalid" }), { status: 400 })));
    await expect(startAgoraRelay({ roomId: "r", rtmpUrl: "x" })).rejects.toThrow(/rtmpUrl invalid/);
  });

  it("reads converter state and treats 404 as gone", async () => {
    setEnv(ENV_VARS);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ state: "running" }), { status: 200 })));
    expect(await getAgoraRelay("conv-1")).toEqual({ converterId: "conv-1", state: "running" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    expect(await getAgoraRelay("conv-1")).toBeNull();
  });

  it("stopping never throws", async () => {
    setEnv(ENV_VARS);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await expect(stopAgoraRelay("conv-1")).resolves.toBeUndefined();
    await expect(stopAgoraRelay(null)).resolves.toBeUndefined();
  });
});
