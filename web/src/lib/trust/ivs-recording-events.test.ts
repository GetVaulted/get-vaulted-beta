import { describe, expect, it } from "vitest";
import { isIvsRecordingStateChangePayload, parseIvsRecordingStateChange } from "@/lib/trust/ivs-recording-events";

describe("ivs recording events", () => {
  const channelArn = "arn:aws:ivs:us-east-1:758530011537:channel/abc";

  it("detects Recording State Change detail-type", () => {
    expect(
      isIvsRecordingStateChangePayload({
        "detail-type": "IVS Recording State Change",
        detail: { recording_status: "Recording End" },
      }),
    ).toBe(true);
  });

  it("detects recording fields without detail-type", () => {
    expect(
      isIvsRecordingStateChangePayload({
        detail: {
          recording_status: "Recording Start",
          recording_s3_bucket_name: "vaulted-live-recordings-beta",
        },
      }),
    ).toBe(true);
  });

  it("does not treat stream-state events as recording", () => {
    expect(
      isIvsRecordingStateChangePayload({
        detail: { channelArn, state: "LIVE" },
      }),
    ).toBe(false);
  });

  it("parses successful recording end with S3 paths", () => {
    const parsed = parseIvsRecordingStateChange({
      "detail-type": "IVS Recording State Change",
      resources: [channelArn],
      detail: {
        recording_status: "Recording End",
        recording_s3_bucket_name: "vaulted-live-recordings-beta",
        recording_s3_key_prefix: "ivs/v1/123/channel/session",
      },
    });
    expect(parsed.kind).toBe("end_success");
    expect(parsed.channelArn).toBe(channelArn);
    expect(parsed.s3Bucket).toBe("vaulted-live-recordings-beta");
    expect(parsed.s3KeyPrefix).toBe("ivs/v1/123/channel/session");
  });

  it("parses recording failure", () => {
    const parsed = parseIvsRecordingStateChange({
      detail: {
        channel_arn: channelArn,
        recording_status: "Recording End Failure",
        recording_status_reason: "InternalError",
      },
    });
    expect(parsed.kind).toBe("end_failure");
    expect(parsed.recordingStatusReason).toBe("InternalError");
  });

  it("unwraps SNS envelope", () => {
    const inner = {
      "detail-type": "IVS Recording State Change",
      resources: [channelArn],
      detail: {
        recording_status: "Recording End",
        recording_s3_bucket_name: "b",
        recording_s3_key_prefix: "p",
      },
    };
    const parsed = parseIvsRecordingStateChange({
      Records: [{ Sns: { Message: JSON.stringify(inner) } }],
    });
    expect(parsed.kind).toBe("end_success");
    expect(parsed.s3Bucket).toBe("b");
  });
});
