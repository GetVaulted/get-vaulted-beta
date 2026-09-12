/**
 * Loads a working SHIPPO_API_TOKEN from Netlify (never prints it),
 * then runs the repair dry-run for the affected order.
 *
 * Usage: npx tsx scripts/run-label-repair-dry-run-with-netlify-shippo.ts
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const contexts = [
  "dev", // beta local tooling; production Netlify value may be a stale short placeholder
  "production",
  "branch:get-vaulted-beta",
  "branch-deploy",
  "deploy-preview",
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

async function loadWorkingShippoFromNetlify(): Promise<{ token: string; context: string } | null> {
  for (const context of contexts) {
    const res = spawnSync(
      "npx",
      ["netlify", "env:list", "--json", "--context", context],
      {
        cwd: webRoot,
        encoding: "utf8",
        shell: true,
        env: process.env,
      },
    );
    const token = extractToken(res.stdout ?? "");
    if (!token) continue;
    try {
      const probe = await fetch("https://api.goshippo.com/addresses/?results=1", {
        headers: { Authorization: `ShippoToken ${token}` },
      });
      if (probe.ok || probe.status === 200) {
        return { token, context };
      }
      // Some accounts return 200 for empty list; accept any non-401/403.
      if (probe.status !== 401 && probe.status !== 403) {
        return { token, context };
      }
      console.error(JSON.stringify({ context, shippoProbeStatus: probe.status, usable: false }));
    } catch (e) {
      console.error(
        JSON.stringify({
          context,
          shippoProbeError: e instanceof Error ? e.message : String(e),
          usable: false,
        }),
      );
    }
  }
  return null;
}

async function main() {
  const loaded = await loadWorkingShippoFromNetlify();
  if (!loaded) {
    console.error(JSON.stringify({ error: "NO_WORKING_SHIPPO_TOKEN_IN_NETLIFY_CONTEXTS", contexts }));
    process.exit(1);
  }

  process.env.SHIPPO_API_TOKEN = loaded.token;
  console.error(
    JSON.stringify({
      shippoTokenLoaded: true,
      source: "netlify",
      context: loaded.context,
      tokenPrinted: false,
    }),
  );

  const run = spawnSync("npx", ["tsx", "scripts/repair-duplicate-label-clawback.ts"], {
    cwd: webRoot,
    encoding: "utf8",
    shell: true,
    env: process.env,
    stdio: "inherit",
  });

  process.exit(run.status ?? 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
