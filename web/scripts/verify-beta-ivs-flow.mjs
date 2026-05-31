#!/usr/bin/env node
/**
 * Deployed beta IVS smoke — seller provision + buyer-safe stream payload check.
 * Does not print stream keys or AWS secrets.
 */
const base = (process.env.SMOKE_BASE_URL || process.env.BETA_API_BASE_URL || "https://beta.shopgetvaulted.com").replace(
  /\/+$/,
  "",
);
const sellerEmail = process.env.BETA_QA_SELLER_EMAIL || "sellerqa@getvaultedtest.com";
const buyerEmail = process.env.BETA_QA_BUYER_EMAIL || "buyerqa@getvaultedtest.com";
const password = process.env.BETA_QA_PASSWORD || "VaultedBetaQA1!";

const FORBIDDEN_BUYER_KEYS = [
  "oneTimeStreamKey",
  "streamKey",
  "streamKeyValue",
  "ingestEndpoint",
  "channelArn",
  "ivsIngestEndpoint",
  "ivsChannelArn",
  "ivsStreamKeyArn",
];

function maskSecret(value) {
  if (!value || typeof value !== "string") return "(none)";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 12)}…${value.slice(-4)} (${value.length} chars)`;
}

function findForbiddenKeys(obj, prefix = "") {
  const hits = [];
  if (!obj || typeof obj !== "object") return hits;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (FORBIDDEN_BUYER_KEYS.some((f) => k.toLowerCase().includes(f.toLowerCase().replace("onetime", "")))) {
      hits.push(path);
    }
    if (v && typeof v === "object") hits.push(...findForbiddenKeys(v, path));
  }
  return hits;
}

function createJar() {
  const jar = new Map();
  return {
    absorb(res) {
      let list = [];
      if (typeof res.headers.getSetCookie === "function") list = res.headers.getSetCookie();
      else {
        const c = res.headers.get("set-cookie");
        if (c) list = c.split(/,(?=[^;]+?=)/).map((s) => s.trim());
      }
      for (const line of list) {
        const nv = line.split(";")[0];
        const eq = nv.indexOf("=");
        if (eq === -1) continue;
        jar.set(nv.slice(0, eq).trim(), nv.slice(eq + 1).trim());
      }
    },
    header() {
      return Array.from(jar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    },
    clear() {
      jar.clear();
    },
  };
}

async function signIn(email, jar) {
  jar.clear();
  const csrfRes = await fetch(`${base}/api/auth/csrf`, { headers: { cookie: jar.header() } });
  jar.absorb(csrfRes);
  const csrfJson = await csrfRes.json();
  const body = new URLSearchParams({
    csrfToken: csrfJson.csrfToken,
    email,
    password,
    callbackUrl: `${base}/account/seller`,
    json: "true",
    redirect: "false",
  });
  const loginRes = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: jar.header() },
    body: body.toString(),
  });
  jar.absorb(loginRes);
  const json = await loginRes.json().catch(() => ({}));
  if (loginRes.status !== 200 || !json.url) {
    throw new Error(`Sign-in failed for ${email}: HTTP ${loginRes.status}`);
  }
}

async function main() {
  const sellerJar = createJar();
  const buyerJar = createJar();
  const report = {
    base,
    sellerSignIn: false,
    buyerSignIn: false,
    roomId: null,
    provision: { ok: false, status: 0, error: null },
    playbackUrlPresent: false,
    ingestPresent: false,
    streamKeyPresent: false,
    buyerLeaks: [],
    goLive: { ok: false, status: 0 },
    streamHealth: null,
    streamHealthAfterSync: null,
    playbackUrl: null,
    errors: [],
  };

  console.log(`\n=== Beta IVS flow smoke @ ${base} ===\n`);

  try {
    await signIn(sellerEmail, sellerJar);
    report.sellerSignIn = true;
    console.log(`✓ Seller signed in (${sellerEmail})`);
  } catch (e) {
    report.errors.push(String(e.message || e));
    console.error(`✗ Seller sign-in: ${e.message}`);
    printReport(report);
    process.exit(1);
  }

  const createRes = await fetch(`${base}/api/live-rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: sellerJar.header() },
    body: JSON.stringify({
      title: `IVS smoke ${new Date().toISOString().slice(0, 16)}`,
      roomType: "auction",
      category: "Sports Cards",
    }),
  });
  const createJson = await createRes.json().catch(() => ({}));
  const roomId = createJson.room?.id ?? createJson.id ?? null;
  if (!createRes.ok || !roomId) {
    report.errors.push(`Create room failed: ${createRes.status} ${JSON.stringify(createJson.error || createJson)}`);
    console.error(`✗ Create room: ${createRes.status}`, createJson.error || createJson);
    printReport(report);
    process.exit(1);
  }
  report.roomId = roomId;
  console.log(`✓ Created room ${report.roomId}`);

  const provRes = await fetch(`${base}/api/live-rooms/${encodeURIComponent(report.roomId)}/stream/provision`, {
    method: "POST",
    headers: { cookie: sellerJar.header() },
  });
  const provJson = await provRes.json().catch(() => ({}));
  report.provision.status = provRes.status;
  report.provision.ok = provRes.ok && provJson.ok === true;
  if (!report.provision.ok) {
    report.provision.error = provJson.error || JSON.stringify(provJson);
    report.errors.push(`Provision failed: ${provRes.status} ${report.provision.error}`);
    console.error(`✗ IVS provision: ${provRes.status}`, provJson.error || provJson);
  } else {
    console.log(`✓ IVS provision HTTP ${provRes.status}`);
    report.playbackUrlPresent = Boolean(provJson.stream?.playbackUrl || provJson.stream?.playbackUrl === "");
    report.playbackUrl = provJson.stream?.playbackUrl ?? null;
    report.ingestPresent = Boolean(provJson.ingest?.endpoint);
    report.streamKeyPresent = Boolean(provJson.ingest?.oneTimeStreamKey);
    report.streamHealth = provJson.stream?.streamHealth ?? null;
    console.log(`  playbackUrl: ${report.playbackUrl ? maskSecret(report.playbackUrl) : "(missing)"}`);
    console.log(`  ingest RTMPS: ${provJson.ingest?.endpoint ? maskSecret(provJson.ingest.endpoint) : "(missing)"}`);
    console.log(`  stream key: ${report.streamKeyPresent ? maskSecret(provJson.ingest.oneTimeStreamKey) : "(missing)"}`);
    console.log(`  streamHealth: ${report.streamHealth ?? "?"}`);
  }

  const buyerStreamRes = await fetch(`${base}/api/live-rooms/${encodeURIComponent(report.roomId)}/stream`);
  const buyerStreamJson = await buyerStreamRes.json().catch(() => ({}));
  report.buyerLeaks = findForbiddenKeys(buyerStreamJson);
  if (buyerStreamRes.ok && report.buyerLeaks.length === 0) {
    console.log(`✓ Buyer stream GET (unauthenticated): no ingest/key fields`);
    console.log(`  buyer playbackUrl: ${buyerStreamJson.stream?.playbackUrl ? "present" : "missing"}`);
    console.log(`  buyer streamHealth: ${buyerStreamJson.stream?.streamHealth ?? "?"}`);
  } else {
    report.errors.push(`Buyer stream leak or error: ${buyerStreamRes.status} leaks=${report.buyerLeaks.join(",")}`);
    console.error(`✗ Buyer stream check: HTTP ${buyerStreamRes.status}`, report.buyerLeaks);
  }

  try {
    await signIn(buyerEmail, buyerJar);
    report.buyerSignIn = true;
    const buyerAuthStream = await fetch(`${base}/api/live-rooms/${encodeURIComponent(report.roomId)}/stream`, {
      headers: { cookie: buyerJar.header() },
    });
    const buyerAuthJson = await buyerAuthStream.json().catch(() => ({}));
    const buyerAuthLeaks = findForbiddenKeys(buyerAuthJson);
    if (buyerAuthLeaks.length === 0) {
      console.log(`✓ Buyer stream GET (authenticated buyerqa): no ingest/key fields`);
    } else {
      report.errors.push(`Authenticated buyer leaks: ${buyerAuthLeaks.join(",")}`);
      console.error(`✗ Authenticated buyer stream leaks:`, buyerAuthLeaks);
    }
  } catch (e) {
    report.errors.push(`Buyer sign-in: ${e.message}`);
    console.error(`✗ Buyer sign-in: ${e.message}`);
  }

  const startRes = await fetch(`${base}/api/live-rooms/${encodeURIComponent(report.roomId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: sellerJar.header() },
    body: JSON.stringify({ action: "start" }),
  });
  const startJson = await startRes.json().catch(() => ({}));
  report.goLive.ok = startRes.ok;
  report.goLive.status = startRes.status;
  if (startRes.ok) {
    console.log(`✓ Go live (PATCH start): HTTP ${startRes.status}`);
  } else {
    report.errors.push(`Go live failed: ${startRes.status} ${startJson.error || ""}`);
    console.error(`✗ Go live: ${startRes.status}`, startJson.error || startJson);
  }

  const syncRes = await fetch(
    `${base}/api/live-rooms/${encodeURIComponent(report.roomId)}/stream?sync=1`,
    { headers: { cookie: sellerJar.header() } },
  );
  const syncJson = await syncRes.json().catch(() => ({}));
  if (syncRes.ok) {
    report.streamHealthAfterSync = syncJson.stream?.streamHealth ?? null;
    console.log(`✓ Host stream sync: streamHealth=${report.streamHealthAfterSync}`);
    if (report.streamHealthAfterSync !== "live") {
      console.log(`  (OBS not running — health stays offline/connecting until RTMPS ingest starts)`);
    }
  } else {
    report.errors.push(`Stream sync failed: ${syncRes.status}`);
    console.error(`✗ Stream sync: ${syncRes.status}`);
  }

  console.log(`\nRoom URL: ${base}/live/${report.roomId}`);
  console.log(`Host console: ${base}/seller/live/${report.roomId}/console`);
  printReport(report);
  process.exit(report.errors.length ? 1 : 0);
}

function printReport(r) {
  console.log("\n--- Summary ---");
  console.log(JSON.stringify(r, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
