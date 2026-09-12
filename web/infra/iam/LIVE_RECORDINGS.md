# Live show recordings (IVS → S3, 30-day retention)

Beta account **`758530011537`** (`us-east-1`). App IAM user: **`vaulted-beta-ivs`**.

Recordings are auto-written by Amazon IVS when a low-latency channel has a **Recording configuration** attached. The Netlify app:

1. Creates/updates channels with `AWS_IVS_RECORDING_CONFIGURATION_ARN`
2. Receives **IVS Recording State Change** events on `POST /api/aws/ivs/events`
3. Lets admins prepare a ZIP archive and download it via a short-lived S3 presigned URL

## 1. S3 bucket

```bash
aws s3api create-bucket \
  --bucket vaulted-live-recordings-beta \
  --region us-east-1

aws s3api put-public-access-block \
  --bucket vaulted-live-recordings-beta \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-lifecycle-configuration \
  --bucket vaulted-live-recordings-beta \
  --lifecycle-configuration file://vaulted-live-recordings-lifecycle.json
```

Use [`vaulted-live-recordings-lifecycle.json`](./vaulted-live-recordings-lifecycle.json) (expire after **30 days**).

## 2. IVS Recording configuration

Console: **IVS → Recording configurations → Create**, destination bucket `vaulted-live-recordings-beta`, default HLS layout.

Or CLI (IAM role for IVS → S3 must allow PutObject on the bucket — AWS docs “IVS recording” service role):

```bash
aws ivs create-recording-configuration \
  --name vaulted-beta-live-recordings \
  --destination-configuration s3={bucketName=vaulted-live-recordings-beta} \
  --region us-east-1
```

Copy the returned ARN into Netlify env `AWS_IVS_RECORDING_CONFIGURATION_ARN`.

## 3. IAM for the app user

Merge [`vaulted-beta-ivs-recording-policy.json`](./vaulted-beta-ivs-recording-policy.json) into the `vaulted-beta-ivs` policy (or attach as an inline policy). Also ensure the full channel policy includes `ivs:UpdateChannel` and `ivs:CreateChannel` (already in [`vaulted-beta-ivs-policy.json`](./vaulted-beta-ivs-policy.json) after recording merge).

```bash
cd web/infra/iam
aws iam put-user-policy \
  --user-name vaulted-beta-ivs \
  --policy-name VaultedBetaIvsLiveRecordings \
  --policy-document file://vaulted-beta-ivs-recording-policy.json
```

## 4. EventBridge → webhook

1. EventBridge rule: source `aws.ivs`, detail-type **IVS Recording State Change** (optionally also keep stream state rules).
2. Target: HTTPS API destination / Lambda / API Gateway that forwards the JSON body to:

   `https://<beta-host>/api/aws/ivs/events`

   with header `Authorization: Bearer <IVS_EVENTS_WEBHOOK_SECRET>` (or `X-IVS-Events-Secret`).

Same secret as existing stream-state ingestion.

## 5. Netlify env

| Variable | Purpose |
| --- | --- |
| `AWS_IVS_RECORDING_CONFIGURATION_ARN` | Attached on CreateChannel / UpdateChannel |
| `AWS_IVS_RECORDINGS_BUCKET` | `vaulted-live-recordings-beta` |
| `AWS_IVS_RECORDINGS_PREFIX` | Optional; default `ivs/` (IVS default layout) |
| `REPLAY_RETENTION_DAYS` | `30` (admin list cutoff; align with S3 lifecycle) |
| `IVS_EVENTS_WEBHOOK_SECRET` | Shared with stream + recording events |

## 6. Verify

```bash
cd web
npx tsx scripts/verify-beta-ivs-config.ts
```

Then run a short test go-live → end show → confirm `LiveStreamReplay.recordingStatus` becomes `ready` and admin **Live Recordings** can prepare/download a ZIP.
