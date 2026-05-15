import os from "node:os";

const port = process.env.PORT || "3000";

function isLanIpv4(net) {
  if (net.internal) return false;
  if (typeof net.address !== "string") return false;
  const fam = net.family;
  return fam === "IPv4" || fam === 4;
}

const addrs = [];
for (const name of Object.keys(os.networkInterfaces())) {
  for (const net of os.networkInterfaces()[name] ?? []) {
    if (isLanIpv4(net)) addrs.push({ name, address: net.address });
  }
}

console.log("\n  Same Wi‑Fi — open one of these on iPhone / iPad (Safari):\n");
if (!addrs.length) {
  console.log("  (no non-loopback IPv4 found — turn Wi‑Fi on, disconnect VPN, try again)\n");
  process.exit(0);
}
for (const { name, address } of addrs) {
  console.log(`    http://${address}:${port}   (${name})`);
}

const preferred =
  addrs.find((a) => !a.address.startsWith("169.254.")) ?? addrs[0];
const base = `http://${preferred.address}:${port}`;
console.log(`
  Copy into .env.local if you test from another device on this Wi‑Fi (must match the browser URL):
  NEXTAUTH_URL="${base}"
`);

console.log(`
  After you change Wi‑Fi networks, restart "npm run dev" so Next.js picks up this PC's new LAN IP.

  Sign-in from the phone:
  1) Pick ONE URL above and use it in Safari exactly (http, IP, port — no trailing slash).
  2) In .env.local set NEXTAUTH_URL to that same base URL, save, then restart "npm run dev".
     (NextAuth only trusts a single URL; it must match the address bar character-for-character.)
  3) Next.js merges your PC's LAN IPv4s into allowedDevOrigins automatically. If RSC still errors, add the
     hostname to NEXT_DEV_ALLOWED_ORIGINS and restart.
  4) Windows: allow inbound TCP ${port} in Defender Firewall for Node or for this port.
  5) iOS: turn off VPN; if sign-in loops, try Settings → Wi‑Fi → (i) → disable "Limit IP Address Tracking"
     for this network, or temporarily disable iCloud Private Relay.
`);
