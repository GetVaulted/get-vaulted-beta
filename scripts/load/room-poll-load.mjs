#!/usr/bin/env node
/**
 * Closed-loop load test for the live-room read endpoints.
 *
 * Simulates N viewers who each poll the room snapshot, chat history and (optionally) report the viewer
 * count at the intervals the real clients use in a BIG room (see web/src/lib/live-room-scale.ts), then prints
 * latency percentiles and error counts. It does NOT open realtime sockets — it measures the HTTP side.
 *
 * Usage (point it at a STAGING deploy, never production):
 *   node scripts/load/room-poll-load.mjs --base https://staging.example.com --room ROOM_ID \
 *        --viewers 1000 --seconds 120 --confirm
 *
 * Optional: --token <supabase access token> to send as a Bearer (signed-in viewer path),
 *           --snapshot-ms 60000 --chat-ms 25000 (per-viewer intervals, jittered +/-20%)
 */
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const base = (opt("base", "") || "").replace(/\/+$/, "");
const room = opt("room", "");
const viewers = Number(opt("viewers", "200"));
const seconds = Number(opt("seconds", "60"));
const snapshotMs = Number(opt("snapshot-ms", "60000"));
const chatMs = Number(opt("chat-ms", "25000"));
const token = opt("token", "");

if (!base || !room || !flag("confirm")) {
  console.error("Required: --base <url> --room <id> --confirm  (staging only: this generates real load)");
  process.exit(2);
}

const jitter = (ms) => Math.round(ms * (0.8 + Math.random() * 0.4));
const stats = { snapshot: [], chat: [], errors: { snapshot: 0, chat: 0 }, status: new Map() };
const headers = token ? { Authorization: `Bearer ${token}` } : {};
const endAt = Date.now() + seconds * 1000;

async function hit(kind, path) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${base}${path}`, { headers, cache: "no-store" });
    await res.arrayBuffer();
    stats.status.set(res.status, (stats.status.get(res.status) ?? 0) + 1);
    if (!res.ok) stats.errors[kind] += 1;
  } catch {
    stats.errors[kind] += 1;
  }
  stats[kind].push(performance.now() - t0);
}

async function viewer(i) {
  // Spread joins over 10s like a real audience arriving.
  await new Promise((r) => setTimeout(r, Math.random() * 10_000));
  const roomPath = `/api/live-rooms/${encodeURIComponent(room)}`;
  await hit("snapshot", roomPath);
  await hit("chat", `${roomPath}/messages`);
  let nextSnapshot = Date.now() + jitter(snapshotMs);
  let nextChat = Date.now() + jitter(chatMs);
  while (Date.now() < endAt) {
    const now = Date.now();
    if (now >= nextSnapshot) {
      await hit("snapshot", roomPath);
      nextSnapshot = Date.now() + jitter(snapshotMs);
    }
    if (now >= nextChat) {
      await hit("chat", `${roomPath}/messages`);
      nextChat = Date.now() + jitter(chatMs);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
};

console.log(`Simulating ${viewers} viewers for ${seconds}s against ${base} (room ${room})...`);
await Promise.all(Array.from({ length: viewers }, (_, i) => viewer(i)));

for (const kind of ["snapshot", "chat"]) {
  const a = stats[kind];
  console.log(
    `${kind.padEnd(8)} requests=${a.length} errors=${stats.errors[kind]} p50=${pct(a, 50)}ms p95=${pct(a, 95)}ms p99=${pct(a, 99)}ms max=${pct(a, 100)}ms`,
  );
}
console.log("HTTP status counts:", Object.fromEntries(stats.status));
const total = stats.snapshot.length + stats.chat.length;
console.log(`Average request rate: ${(total / seconds).toFixed(1)}/s`);
