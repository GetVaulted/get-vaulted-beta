#!/usr/bin/env node
/**
 * Emergency beta catalog cleanup via HTTP (no DATABASE_URL required).
 * Deletes all sellerqa listings + cancels sellerqa live rooms on deployed beta.
 *
 * Does NOT remove other sellers' rows (e.g. integration test sellerlr) — use qa:wipe-beta-full for that.
 *
 * Usage:
 *   node scripts/purge-beta-catalog-via-api.mjs
 *   node scripts/purge-beta-catalog-via-api.mjs --dry-run
 */
const base = (process.env.SMOKE_BASE_URL || process.env.BETA_API_BASE_URL || "https://beta.shopgetvaulted.com").replace(
  /\/+$/,
  "",
);
const sellerEmail = process.env.BETA_QA_SELLER_EMAIL || "sellerqa@getvaultedtest.com";
const password = process.env.BETA_QA_PASSWORD || "VaultedBetaQA1!";
const dryRun = process.argv.includes("--dry-run");

const jar = new Map();

function absorbCookies(res) {
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
}

function cookieHeader() {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function signIn(email) {
  jar.clear();
  const csrfRes = await fetch(`${base}/api/auth/csrf`, { headers: { cookie: cookieHeader() } });
  absorbCookies(csrfRes);
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
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: cookieHeader() },
    body: body.toString(),
  });
  absorbCookies(loginRes);
  const json = await loginRes.json().catch(() => ({}));
  if (loginRes.status !== 200 || !json.url) {
    throw new Error(`Sign-in failed for ${email}: ${loginRes.status}`);
  }
}

async function main() {
  console.log(`${dryRun ? "[dry-run] " : ""}Purging sellerqa catalog @ ${base}\n`);
  await signIn(sellerEmail);

  const mineRes = await fetch(`${base}/api/listings?scope=mine`, {
    headers: { cookie: cookieHeader() },
  });
  const mineJson = await mineRes.json();
  const listings = Array.isArray(mineJson.listings) ? mineJson.listings : [];
  console.log(`Found ${listings.length} seller listing(s)`);

  for (const l of listings) {
    if (dryRun) {
      console.log(`  would DELETE ${l.title} (${l.id})`);
      continue;
    }
    const del = await fetch(`${base}/api/listings/${encodeURIComponent(l.id)}`, {
      method: "DELETE",
      headers: { cookie: cookieHeader() },
    });
    console.log(`  DELETE ${l.title} → ${del.status}`);
  }

  const roomsRes = await fetch(`${base}/api/live-rooms?mine=1`, {
    headers: { cookie: cookieHeader() },
  });
  const roomsJson = await roomsRes.json();
  const rooms = Array.isArray(roomsJson.rooms) ? roomsJson.rooms : [];
  console.log(`\nFound ${rooms.length} seller live room(s)`);

  for (const r of rooms) {
    if (r.status === "ended") continue;
    const action = r.status === "live" ? "end" : "cancel";
    if (dryRun) {
      console.log(`  would ${action} ${r.title} (${r.id}) status=${r.status}`);
      continue;
    }
    let patch = await fetch(`${base}/api/live-rooms/${encodeURIComponent(r.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ action }),
    });
    if (!patch.ok && action === "cancel") {
      patch = await fetch(`${base}/api/live-rooms/${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie: cookieHeader() },
        body: JSON.stringify({ action: "end" }),
      });
    }
    console.log(`  ${action} ${r.title} → ${patch.status}`);
  }

  if (!dryRun) {
    console.log("\nRe-checking public catalog …");
    const pub = await fetch(`${base}/api/listings?scope=published`, { cache: "no-store" }).then((r) => r.json());
    const live = await fetch(`${base}/api/live-rooms`, { cache: "no-store" }).then((r) => r.json());
    console.log(`  published listings: ${pub.listings?.length ?? "?"}`);
    console.log(`  live rooms: ${live.rooms?.length ?? "?"}`);
    if ((pub.listings?.length ?? 0) > 0 || (live.rooms?.length ?? 0) > 0) {
      console.log("\nSome rows remain (other sellers or cancel not deployed). Run qa:wipe-beta-full with beta DATABASE_URL.");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
