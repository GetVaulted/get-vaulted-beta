/**
 * Probe Netlify SHIPPO_API_TOKEN per context. Never prints the token.
 */
import { spawnSync } from "node:child_process";

const contexts = [
  "production",
  "deploy-preview",
  "branch-deploy",
  "dev",
  "branch:get-vaulted-beta",
];

function extractToken(stdout: string): string | null {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>;
    const raw = j.SHIPPO_API_TOKEN;
    if (typeof raw === "string" && raw.trim().length > 5) return raw.trim();
    if (raw && typeof raw === "object" && "value" in (raw as object)) {
      const v = (raw as { value?: unknown }).value;
      if (typeof v === "string" && v.trim().length > 5) return v.trim();
    }
  } catch {
    return null;
  }
  return null;
}

async function main() {
  const results = [];
  for (const context of contexts) {
    const res = spawnSync(
      "npx",
      ["netlify", "env:list", "--json", "--context", context],
      { encoding: "utf8", shell: true },
    );
    const token = extractToken(res.stdout ?? "");
    if (!token) {
      results.push({ context, status: "MISSING_OR_EMPTY" });
      continue;
    }
    const kind = token.startsWith("shippo_live_")
      ? "live"
      : token.startsWith("shippo_test_")
        ? "test"
        : "other";
    try {
      const probe = await fetch("https://api.goshippo.com/addresses/?results=1", {
        headers: { Authorization: `ShippoToken ${token}` },
      });
      results.push({
        context,
        status: `HTTP_${probe.status}`,
        tokenKind: kind,
        tokenLen: token.length,
      });
    } catch (e) {
      results.push({
        context,
        status: "FETCH_ERROR",
        tokenKind: kind,
        tokenLen: token.length,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  console.log(JSON.stringify({ results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
