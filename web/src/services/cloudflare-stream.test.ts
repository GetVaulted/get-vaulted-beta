import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cloudflareHlsPlaybackUrl,
  createCloudflareLiveInput,
  getCloudflareStreamConfig,
  getCloudflareStreamStatus,
  isCloudflareStreamConfigured,
} from "./cloudflare-stream";

const ENV = {
  CLOUDFLARE_ACCOUNT_ID: "acct123",
  CLOUDFLARE_STREAM_API_TOKEN: "tok",
  CLOUDFLARE_STREAM_CUSTOMER_CODE: "abc123xyz",
} as unknown as NodeJS.ProcessEnv;

function setEnv(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  setEnv({
    CLOUDFLARE_ACCOUNT_ID: undefined,
    CLOUDFLARE_STREAM_API_TOKEN: undefined,
    CLOUDFLARE_STREAM_CUSTOMER_CODE: undefined,
    CLOUDFLARE_STREAM_LOW_LATENCY: undefined,
  });
});

describe("cloudflare stream config", () => {
  it("needs account id, token and customer code", () => {
    expect(isCloudflareStreamConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isCloudflareStreamConfigured({ ...ENV, CLOUDFLARE_STREAM_API_TOKEN: "" } as NodeJS.ProcessEnv)).toBe(false);
    expect(isCloudflareStreamConfigured(ENV)).toBe(true);
  });

  it("accepts the customer code pasted as a full subdomain", () => {
    const cfg = getCloudflareStreamConfig({
      ...ENV,
      CLOUDFLARE_STREAM_CUSTOMER_CODE: "customer-abc123xyz.cloudflarestream.com",
    } as NodeJS.ProcessEnv);
    expect(cfg?.customerCode).toBe("abc123xyz");
  });

  it("builds the HLS manifest URL from the live input id", () => {
    expect(cloudflareHlsPlaybackUrl("abc123xyz", "uid1")).toBe(
      "https://customer-abc123xyz.cloudflarestream.com/uid1/manifest/video.m3u8",
    );
  });
});

describe("cloudflare stream API", () => {
  it("creates a recording live input and returns RTMPS + playback URL", async () => {
    setEnv(ENV as Record<string, string>);
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          result: { uid: "uid1", rtmps: { url: "rtmps://live.cloudflare.com:443/live/", streamKey: "key1" } },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const input = await createCloudflareLiveInput("room1");
    expect(input).toEqual({
      uid: "uid1",
      rtmpsUrl: "rtmps://live.cloudflare.com:443/live/",
      streamKey: "key1",
      playbackUrl: "https://customer-abc123xyz.cloudflarestream.com/uid1/manifest/video.m3u8",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acct123/stream/live_inputs");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body)).recording.mode).toBe("automatic");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("surfaces Cloudflare errors", async () => {
    setEnv(ENV as Record<string, string>);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ message: "bad token" }] }), { status: 403 })),
    );
    await expect(createCloudflareLiveInput("room1")).rejects.toThrow(/bad token/);
  });

  it("maps lifecycle live:true/false to health and treats failures as a failed probe", async () => {
    setEnv(ENV as Record<string, string>);
    const respond = (body: unknown, status = 200) =>
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
    respond({ isInput: true, videoUID: "v", live: true });
    expect(await getCloudflareStreamStatus("uid1")).toEqual({ probeFailed: false, health: "live" });
    respond({ isInput: true, videoUID: null, live: false });
    expect(await getCloudflareStreamStatus("uid1")).toEqual({ probeFailed: false, health: "offline" });
    respond({}, 500);
    expect(await getCloudflareStreamStatus("uid1")).toEqual({ probeFailed: true });
    respond({ nope: 1 });
    expect(await getCloudflareStreamStatus("uid1")).toEqual({ probeFailed: true });
  });

  it("reports not configured when env is missing", async () => {
    await expect(createCloudflareLiveInput("room1")).rejects.toThrow(/not configured/);
  });
});
