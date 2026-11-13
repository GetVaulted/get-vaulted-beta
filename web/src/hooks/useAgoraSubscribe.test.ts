import { describe, expect, it } from "vitest";
import { parseViewerSession } from "./useAgoraSubscribe";
import { isAgoraDirectProvider, parseBuyerSafeStreamPayload } from "@/lib/live-stream-playback";

const GOOD = { agora: { appId: "app", channel: "gv-r1", hostUid: 7, uid: 0, token: "tok", expiresInSeconds: 7200 } };

describe("parseViewerSession", () => {
  it("reads a valid viewer pass", () => {
    expect(parseViewerSession(GOOD)).toEqual(GOOD.agora);
  });

  it("rejects incomplete or malformed payloads", () => {
    expect(parseViewerSession(null)).toBeNull();
    expect(parseViewerSession({})).toBeNull();
    expect(parseViewerSession({ agora: { ...GOOD.agora, token: "" } })).toBeNull();
    expect(parseViewerSession({ agora: { ...GOOD.agora, hostUid: 0 } })).toBeNull();
  });
});

describe("agora provider flag on the buyer stream payload", () => {
  it("parses the provider and detects an Agora show", () => {
    const parsed = parseBuyerSafeStreamPayload({
      stream: { streamHealth: "live", streamMode: "stage_webrtc", stageAvailable: true, streamProvider: "agora_rtc" },
    });
    expect(parsed?.streamProvider).toBe("agora_rtc");
    expect(isAgoraDirectProvider(parsed?.streamProvider)).toBe(true);
    expect(isAgoraDirectProvider("aws_ivs")).toBe(false);
    expect(isAgoraDirectProvider(null)).toBe(false);
  });
});
