/**
 * Gate before mobile device smoke tests against beta.
 *
 * Confirms the unified marketplace listings API is deployed on the target host.
 * Run after web/beta deploy:
 *   node scripts/beta-unified-listings-api-readiness.mjs
 *   BETA_API_BASE_URL=https://beta.shopgetvaulted.com node scripts/beta-unified-listings-api-readiness.mjs
 *
 * Exit 0 = safe to point Expo at this host and run cross-platform catalog smoke tests.
 * Exit 1 = do not smoke test mobile against this host yet.
 */
const base = (process.env.BETA_API_BASE_URL || process.env.SMOKE_BASE_URL || "https://beta.shopgetvaulted.com").replace(
  /\/+$/,
  "",
);

const FAKE_CUID = "cl000000000000000000000000";

function fail(msg) {
  console.error(`FAIL: ${msg}`);
}

function pass(msg) {
  console.log(`OK: ${msg}`);
}

async function readJson(res) {
  const text = await res.text();
  if (!text.trim()) return { _raw: "" };
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}

function isHtml(body) {
  const raw = typeof body === "string" ? body : body?._raw;
  return typeof raw === "string" && /^\s*</.test(raw);
}

async function check(name, url, init, assert) {
  let res;
  try {
    res = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) } });
  } catch (e) {
    fail(`${name} — network error: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
  const body = await readJson(res);
  if (isHtml(body._raw ?? body)) {
    fail(`${name} — got HTML (API route missing or static host): ${url}`);
    return false;
  }
  const ok = assert(res, body);
  if (!ok) {
    const preview = JSON.stringify(body).slice(0, 160);
    fail(`${name} — ${res.status} ${preview}`);
  } else {
    pass(`${name} (${res.status})`);
  }
  return ok;
}

async function main() {
  console.log(`Checking unified listings API at ${base}\n`);

  const results = [];

  results.push(
    await check(
      "GET /api/listings?scope=published",
      `${base}/api/listings?scope=published`,
      { method: "GET" },
      (res, body) => res.ok && Array.isArray(body.listings),
    ),
  );

  results.push(
    await check(
      "GET /api/listings?scope=ids (empty ids → [])",
      `${base}/api/listings?scope=ids&ids=`,
      { method: "GET" },
      (res, body) => res.ok && Array.isArray(body.listings) && body.listings.length === 0,
    ),
  );

  results.push(
    await check(
      "POST /api/listings (auth required)",
      `${base}/api/listings`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      (res, body) => res.status === 401 && typeof body.error === "string",
    ),
  );

  results.push(
    await check(
      "POST /api/uploads/listing-image (auth required)",
      `${base}/api/uploads/listing-image`,
      { method: "POST" },
      (res, body) => res.status === 401 && typeof body.error === "string",
    ),
  );

  results.push(
    await check(
      "GET /api/listings/[id] (JSON 404 for unknown id)",
      `${base}/api/listings/${encodeURIComponent(FAKE_CUID)}`,
      { method: "GET" },
      (res, body) => res.status === 404 && typeof body.error === "string",
    ),
  );

  const badScope = await fetch(`${base}/api/listings?scope=not-a-real-scope`, {
    headers: { Accept: "application/json" },
  });
  const badBody = await readJson(badScope);
  if (badScope.status === 400 && badBody.error === "Invalid scope") {
    pass("Invalid scope returns 400 (route handler present)");
    results.push(true);
  } else {
    fail(`Unexpected invalid-scope response: ${badScope.status} ${JSON.stringify(badBody).slice(0, 120)}`);
    results.push(false);
  }

  console.log("");
  if (results.every(Boolean)) {
    console.log("Beta unified listings API looks ready.");
    console.log("Next: npx expo start --clear (in mobile/), then run device smoke test.");
    process.exit(0);
  }

  console.error("Beta is NOT ready for mobile catalog smoke tests.");
  console.error("Deploy web/beta with unified /api/listings changes, then re-run this script.");
  console.error(
    "Expected mobile failures if you skip deploy (not mobile bugs): trade hydration, order thumbnails,",
  );
  console.error("batch listing lookup, 401 publish, invalid scope, missing listing after publish.");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
