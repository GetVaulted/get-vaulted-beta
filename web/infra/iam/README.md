# Beta IVS IAM — `vaulted-beta-ivs`

Netlify beta (`get-vaulted-beta`) uses IAM user **`vaulted-beta-ivs`** in account **`758530011537`** (`us-east-1`) for live streaming.

## Real-Time (WebRTC Stages) — required for Go Live

If Go Live fails with `not authorized for ivs:CreateStage`, attach the Real-Time statement to the user's policy.

**Minimal add-on** (merge into existing policy): [`vaulted-beta-ivs-realtime-policy.json`](./vaulted-beta-ivs-realtime-policy.json)

**Full beta IVS policy** (Low-Latency channels + Real-Time): [`vaulted-beta-ivs-policy.json`](./vaulted-beta-ivs-policy.json)

### AWS Console

1. IAM → Users → **vaulted-beta-ivs** → Permissions.
2. Edit the inline policy or managed policy version the user already uses.
3. Add a statement with the actions and resources from `vaulted-beta-ivs-realtime-policy.json`.
4. Save and retry Go Live (or `npx tsx scripts/verify-beta-ivs-config.ts` from `web/`).

### AWS CLI (admin credentials)

Merge Real-Time into an **inline** policy on the user:

```bash
cd web/infra/iam
aws iam put-user-policy \
  --user-name vaulted-beta-ivs \
  --policy-name VaultedBetaIvsRealTime \
  --policy-document file://vaulted-beta-ivs-realtime-policy.json
```

Or publish a new version of an existing **managed** policy:

```bash
aws iam create-policy-version \
  --policy-arn arn:aws:iam::758530011537:policy/YOUR_POLICY_NAME \
  --policy-document file://vaulted-beta-ivs-policy.json \
  --set-as-default
```

## Verify

From `web/` with the same env vars as Netlify beta:

```bash
npx tsx scripts/verify-beta-ivs-config.ts
```

A successful run lists sample IVS channels and confirms Real-Time `ivs:GetStage` authorization (via a harmless not-found probe).
