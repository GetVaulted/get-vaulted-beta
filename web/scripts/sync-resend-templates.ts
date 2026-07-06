/**
 * Create or update Get Vaulted Resend hosted templates and publish them.
 *
 * Requires:
 *   RESEND_API_KEY — Resend API key with template permissions
 *
 * Usage (from web/):
 *   RESEND_API_KEY=re_... npm run resend:sync-templates
 *
 * After sync, set on Netlify (production):
 *   RESEND_USE_HOSTED_TEMPLATES=1
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RESEND_TEMPLATE_DEFINITIONS,
  type ResendTemplateDefinition,
} from "../src/lib/resend-templates/definitions";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

require("dotenv").config({ path: path.join(webRoot, ".env") });
require("dotenv").config({ path: path.join(webRoot, ".env.local"), override: true });

const RESEND_API = "https://api.resend.com";

type ListedTemplate = { id: string; name: string };

function log(msg: string) {
  console.log(msg);
}

function apiKey(): string {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.error("Missing RESEND_API_KEY. Set it in web/.env or the shell.");
    process.exit(1);
  }
  return key;
}

async function resendFetch(
  key: string,
  method: string,
  pathname: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null; text: string }> {
  const res = await fetch(`${RESEND_API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function listTemplates(key: string): Promise<ListedTemplate[]> {
  const out: ListedTemplate[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const qs = cursor ? `?limit=100&after=${encodeURIComponent(cursor)}` : "?limit=100";
    const res = await resendFetch(key, "GET", `/templates${qs}`);
    if (!res.ok) {
      throw new Error(`List templates failed (${res.status}): ${res.text.slice(0, 400)}`);
    }
    const data = res.json?.data;
    if (!Array.isArray(data)) break;
    for (const row of data) {
      if (row && typeof row === "object") {
        const id = (row as { id?: string }).id;
        const name = (row as { name?: string }).name;
        if (id && name) out.push({ id, name });
      }
    }
    const hasMore = Boolean(res.json?.has_more);
    const last = data[data.length - 1] as { id?: string } | undefined;
    if (!hasMore || !last?.id) break;
    cursor = last.id;
  }
  return out;
}

async function upsertTemplate(key: string, def: ResendTemplateDefinition, existingId?: string): Promise<string> {
  const payload = {
    name: def.name,
    subject: def.subject,
    html: def.html,
    text: def.text,
    variables: def.variables,
  };

  if (existingId) {
    const res = await resendFetch(key, "PATCH", `/templates/${encodeURIComponent(existingId)}`, payload);
    if (!res.ok) {
      throw new Error(`Update template ${def.name} failed (${res.status}): ${res.text.slice(0, 400)}`);
    }
    log(`  updated ${def.name} (${existingId})`);
    return existingId;
  }

  const res = await resendFetch(key, "POST", "/templates", payload);
  if (!res.ok) {
    throw new Error(`Create template ${def.name} failed (${res.status}): ${res.text.slice(0, 400)}`);
  }
  const id = typeof res.json?.id === "string" ? res.json.id : null;
  if (!id) throw new Error(`Create template ${def.name} returned no id`);
  log(`  created ${def.name} (${id})`);
  return id;
}

async function publishTemplate(key: string, id: string, name: string): Promise<void> {
  const res = await resendFetch(key, "POST", `/templates/${encodeURIComponent(id)}/publish`);
  if (!res.ok) {
    throw new Error(`Publish template ${name} failed (${res.status}): ${res.text.slice(0, 400)}`);
  }
  log(`  published ${name}`);
}

async function main() {
  const key = apiKey();
  log("Syncing Get Vaulted Resend templates …");
  const existing = await listTemplates(key);
  const byName = new Map(existing.map((t) => [t.name, t.id]));

  for (const def of RESEND_TEMPLATE_DEFINITIONS) {
    log(`\n→ ${def.name}`);
    const id = await upsertTemplate(key, def, byName.get(def.name));
    await publishTemplate(key, id, def.name);
  }

  log("\nDone. Templates published:");
  for (const def of RESEND_TEMPLATE_DEFINITIONS) {
    log(`  • ${def.name}`);
  }
  log("\nNext: set RESEND_USE_HOSTED_TEMPLATES=1 in Netlify production env to send via hosted templates.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
