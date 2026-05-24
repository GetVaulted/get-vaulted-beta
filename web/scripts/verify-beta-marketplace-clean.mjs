/**
 * Verify beta marketplace/live catalog is empty (hits deployed API, not local DB).
 *
 * Usage:
 *   node scripts/verify-beta-marketplace-clean.mjs
 *   BETA_API_BASE_URL=https://beta.shopgetvaulted.com node scripts/verify-beta-marketplace-clean.mjs
 */
const base = (process.env.BETA_API_BASE_URL || process.env.SMOKE_BASE_URL || "https://beta.shopgetvaulted.com").replace(
  /\/+$/,
  "",
);

const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error(`FAIL: ${msg}`);
}

function pass(msg) {
  console.log(`OK:   ${msg}`);
}

async function getJson(path) {
  const res = await fetch(`${base}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text.slice(0, 200) };
  }
  return { res, body };
}

async function main() {
  console.log(`Verifying beta catalog @ ${base}\n`);

  const { res: pubRes, body: pubBody } = await getJson("/api/listings?scope=published");
  if (!pubRes.ok) {
    fail(`GET /api/listings?scope=published → ${pubRes.status}`);
  } else {
    const listings = Array.isArray(pubBody.listings) ? pubBody.listings : [];
    if (listings.length === 0) {
      pass("GET /api/listings?scope=published → []");
    } else {
      fail(`GET /api/listings?scope=published → ${listings.length} listing(s)`);
      for (const l of listings.slice(0, 10)) {
        console.error(`      - ${l.title} (${l.sellerUsername ?? "?"}) id=${l.id}`);
      }
      if (listings.length > 10) console.error(`      … and ${listings.length - 10} more`);
    }
  }

  const { res: liveRes, body: liveBody } = await getJson("/api/live-rooms");
  if (!liveRes.ok) {
    fail(`GET /api/live-rooms → ${liveRes.status}`);
  } else {
    const rooms = Array.isArray(liveBody.rooms) ? liveBody.rooms : [];
    if (rooms.length === 0) {
      pass("GET /api/live-rooms → []");
    } else {
      fail(`GET /api/live-rooms → ${rooms.length} room(s)`);
      for (const r of rooms) {
        console.error(`      - ${r.title} (${r.sellerUsername ?? "?"}) status=${r.status} id=${r.id}`);
      }
    }
  }

  const smoke = (pubBody.listings ?? []).filter((l) =>
    /beta smoke|integration listing/i.test(l.title ?? ""),
  );
  if (smoke.length > 0) {
    fail(`${smoke.length} smoke/integration listing(s) still published`);
  } else if (pubRes.ok) {
    pass("No smoke/integration titles in published feed");
  }

  console.log("");
  if (failures.length) {
    console.error(`${failures.length} check(s) failed.`);
    console.error("\nCommon causes:");
    console.error("  • qa:wipe-beta-full ran against wrong DATABASE_URL (not Netlify beta)");
    console.error("  • Vitest integration tests left *@test.internal rows (sellerlr → Integration listing)");
    console.error("\nFix:");
    console.error("  1. CONFIRM_BETA_INTEGRATION_PURGE=1 npm run qa:purge-beta-integration");
    console.error("  2. CONFIRM_BETA_FULL_WIPE=1 ALLOW_BETA_QA_SEED=1 npm run qa:wipe-beta-full");
    console.error("  3. Deploy latest web (hides *@test.internal from public API even if rows linger)");
    process.exit(1);
  }
  console.log("Beta marketplace + live discovery are empty.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
