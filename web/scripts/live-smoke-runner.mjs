#!/usr/bin/env node
/**
 * Lightweight manual+automated smoke helper for Vaulted Live.
 *
 * Usage:
 *   node scripts/live-smoke-runner.mjs --room <roomId>
 *
 * Optional env:
 *   BASE_URL=http://localhost:3000
 */

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const args = process.argv.slice(2);
const roomIdx = args.indexOf("--room");
const roomId = roomIdx >= 0 ? args[roomIdx + 1] : null;

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function ping(path) {
  const url = `${baseUrl}${path}`;
  try {
    const res = await fetch(url, { method: "GET" });
    console.log(`${res.ok ? "OK " : "ERR"} ${res.status} ${url}`);
    return res.ok;
  } catch (e) {
    console.log(`ERR fetch ${url}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

section("Vaulted Live Smoke Runner");
console.log(`Base URL: ${baseUrl}`);
if (!roomId) {
  console.log("No --room provided. This runner will only do baseline API checks.");
}

section("Baseline API Reachability");
await ping("/live");
if (roomId) {
  await ping(`/live/${encodeURIComponent(roomId)}`);
  await ping(`/api/live-rooms/${encodeURIComponent(roomId)}`);
  await ping(`/api/live-rooms/${encodeURIComponent(roomId)}/messages`);
}

section("Manual Dual-Session Checklist");
const checklist = [
  "Open seller session + buyer session on same room",
  "Verify viewer count increments/decrements on join/leave",
  "Send buyer chat and confirm instant seller visibility",
  "Start auction; confirm buyer sees status/active item quickly",
  "Place near-simultaneous bids from two buyers; verify deterministic winner/highest bid",
  "End auction; verify late bids are rejected",
  "Complete checkout; verify purchase_completed behavior and sold state sync",
  "Toggle app background/foreground and temporary offline/online to verify reconnect recovery",
];
for (const item of checklist) console.log(`- [ ] ${item}`);

section("Debug Tips");
console.log("- Set NEXT_PUBLIC_LIVE_DEBUG=true and watch [LIVE_DEBUG] logs in DevTools.");
console.log("- Compare event timing averages before/after reconnect events.");
console.log("- Ensure no sensitive user/payment payloads appear in logs.");
