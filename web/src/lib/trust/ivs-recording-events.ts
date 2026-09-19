/**
 * Parse Amazon IVS "Recording State Change" EventBridge / SNS payloads.
 * @see https://docs.aws.amazon.com/ivs/latest/LowLatencyUserGuide/eventbridge.html
 */

export type IvsRecordingEventKind = "start" | "end_success" | "end_failure" | "start_failure" | "unknown";

export type ParsedIvsRecordingEvent = {
  kind: IvsRecordingEventKind;
  channelArn: string | null;
  recordingStatus: string | null;
  recordingStatusReason: string | null;
  s3Bucket: string | null;
  s3KeyPrefix: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function unwrapEventBody(body: unknown): Record<string, unknown> | null {
  const root = asRecord(body);
  if (!root) return null;

  if (Array.isArray(root.Records) && root.Records[0]) {
    const rec = asRecord(root.Records[0]);
    const sns = asRecord(rec?.Sns);
    const msg = sns?.Message;
    if (typeof msg === "string") {
      try {
        return unwrapEventBody(JSON.parse(msg) as unknown);
      } catch {
        return null;
      }
    }
  }

  return root;
}

function normalizeRecordingStatus(raw: string | null): IvsRecordingEventKind {
  if (!raw) return "unknown";
  const s = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (s === "recording end" || s === "recording end success" || s === "recording_end") return "end_success";
  if (s === "recording start" || s === "recording_start") return "start";
  if (s.includes("start") && s.includes("fail")) return "start_failure";
  if (s.includes("end") && s.includes("fail")) return "end_failure";
  if (s.includes("fail")) return "end_failure";
  return "unknown";
}

/** True when the payload looks like an IVS recording event (vs stream-state). */
export function isIvsRecordingStateChangePayload(body: unknown): boolean {
  const root = unwrapEventBody(body);
  if (!root) return false;

  const detailType = pickString(root, ["detail-type", "detailType", "DetailType"]);
  if (detailType && /recording\s*state\s*change/i.test(detailType)) return true;

  const detail = asRecord(root.detail) ?? asRecord(root.Detail);
  if (!detail) return false;
  return Boolean(
    pickString(detail, ["recording_status", "recordingStatus", "RecordingStatus"]) ||
      pickString(detail, ["recording_s3_bucket_name", "recordingS3BucketName", "bucket_name"]),
  );
}

export function parseIvsRecordingStateChange(body: unknown): ParsedIvsRecordingEvent {
  const root = unwrapEventBody(body);
  if (!root) {
    return {
      kind: "unknown",
      channelArn: null,
      recordingStatus: null,
      recordingStatusReason: null,
      s3Bucket: null,
      s3KeyPrefix: null,
    };
  }

  const detail = asRecord(root.detail) ?? asRecord(root.Detail) ?? root;
  const resources = Array.isArray(root.resources)
    ? root.resources.find((r): r is string => typeof r === "string" && r.includes(":channel/"))
    : null;

  const channelArn =
    pickString(detail, ["channel_arn", "channelArn", "ChannelArn"]) ||
    (typeof resources === "string" ? resources.trim() : null);

  const recordingStatus = pickString(detail, ["recording_status", "recordingStatus", "RecordingStatus"]);
  const recordingStatusReason = pickString(detail, [
    "recording_status_reason",
    "recordingStatusReason",
    "RecordingStatusReason",
  ]);
  const s3Bucket = pickString(detail, [
    "recording_s3_bucket_name",
    "recordingS3BucketName",
    "bucket_name",
    "s3Bucket",
  ]);
  const s3KeyPrefix = pickString(detail, [
    "recording_s3_key_prefix",
    "recordingS3KeyPrefix",
    "key_prefix",
    "s3KeyPrefix",
  ]);

  return {
    kind: normalizeRecordingStatus(recordingStatus),
    channelArn,
    recordingStatus,
    recordingStatusReason,
    s3Bucket,
    s3KeyPrefix,
  };
}
