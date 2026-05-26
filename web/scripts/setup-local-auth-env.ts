/**
 * Write web/.env.local with auth vars required for local sign-in against beta Supabase.
 * Safe to re-run; does not print secrets.
 */
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const repoRoot = path.join(webRoot, "..");
const envLocalPath = path.join(webRoot, ".env.local");

config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: envLocalPath, quiet: true });
config({ path: path.join(repoRoot, "mobile", ".env"), quiet: true });

const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ??
  process.env.SUPABASE_ANON_KEY?.trim() ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ??
  "";

const lines: string[] = [
  "# Local overrides — gitignored. Required for NextAuth + Supabase credential sign-in.",
  'NEXTAUTH_URL="http://localhost:3000"',
];

if (process.env.NEXTAUTH_SECRET?.trim()) {
  lines.push(`NEXTAUTH_SECRET="${process.env.NEXTAUTH_SECRET.trim()}"`);
} else {
  const secret = randomBytes(32).toString("base64");
  lines.push(`NEXTAUTH_SECRET="${secret}"`);
  console.log("Generated new NEXTAUTH_SECRET for local dev.");
}

if (anonKey) {
  lines.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY="${anonKey}"`);
  lines.push(`SUPABASE_ANON_KEY="${anonKey}"`);
} else {
  console.error(
    "Missing anon key. Copy NEXT_PUBLIC_SUPABASE_ANON_KEY from Supabase Dashboard → Settings → API (project xkaaicokjgmpbctfermj) into web/.env.local",
  );
  process.exit(1);
}

lines.push("");
lines.push("# Optional: enable live marketplace locally");
lines.push("# LIVE_MARKETPLACE_ENABLED=1");

const existing = fs.existsSync(envLocalPath) ? fs.readFileSync(envLocalPath, "utf8") : "";
const merged = new Map<string, string>();
for (const line of [...existing.split("\n"), ...lines]) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq <= 0) continue;
  merged.set(line.slice(0, eq).trim(), line);
}
for (const line of lines) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq <= 0) continue;
  merged.set(line.slice(0, eq).trim(), line);
}

fs.writeFileSync(envLocalPath, [...merged.values()].join("\n") + "\n", "utf8");
console.log(`Wrote ${envLocalPath}`);
console.log("Set NEXTAUTH_URL=http://localhost:3000");
console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY: ${anonKey ? "configured" : "missing"}`);
console.log(`NEXTAUTH_SECRET: ${process.env.NEXTAUTH_SECRET?.trim() ? "kept existing" : "generated"}`);
