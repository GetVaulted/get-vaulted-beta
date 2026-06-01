/**
 * Capture host console team-board UI states for QA.
 *
 * Usage (from web/):
 *   $env:PLAYWRIGHT_BASE_URL="https://beta.shopgetvaulted.com"
 *   $env:GV_QA_SELLER_EMAIL="sellerqa@getvaultedtest.com"
 *   $env:GV_QA_SELLER_PASSWORD="VaultedBetaQA1!"
 *   $env:GV_HOST_CONSOLE_ROOM_ID="<break-room-id>"
 *   node scripts/capture-host-team-board-screenshots.mjs
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const email = process.env.GV_QA_SELLER_EMAIL || "";
const password = process.env.GV_QA_SELLER_PASSWORD || "";
const roomIdEnv = process.env.GV_HOST_CONSOLE_ROOM_ID || "";
const outDir = path.resolve(process.cwd(), "artifacts/host-team-board-ui");

async function resolveConsoleUrl(page) {
  if (roomIdEnv) {
    return `${baseURL}/seller/live/${encodeURIComponent(roomIdEnv)}/console`;
  }
  await page.goto(`${baseURL}/seller/live`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const consoleLink = page.getByRole("link", { name: /console/i }).first();
  await consoleLink.waitFor({ timeout: 60_000 });
  const href = await consoleLink.getAttribute("href");
  if (!href) throw new Error("No break host console link on /seller/live");
  return href.startsWith("http") ? href : new URL(href, baseURL).toString();
}

async function signIn(page) {
  await page.goto(`${baseURL}/signin`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/signin"), { timeout: 60_000 });
}

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`wrote ${file}`);
}

async function main() {
  if (!email || !password) {
    console.error("Set GV_QA_SELLER_EMAIL and GV_QA_SELLER_PASSWORD (optional: GV_HOST_CONSOLE_ROOM_ID)");
    process.exit(1);
  }
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();

  await signIn(page);
  const consoleUrl = await resolveConsoleUrl(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(consoleUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(3000);

  await shot(page, "01-console-team-board-closed");

  const tools = page.getByRole("button", { name: "Tools" }).first();
  if (await tools.isVisible().catch(() => false)) await tools.click();

  await page.getByRole("button", { name: "Teams" }).first().click();
  await page.waitForTimeout(800);
  await shot(page, "02-console-team-board-expanded");

  await page.getByLabel("Minimize team board").first().click();
  await page.waitForTimeout(500);
  await shot(page, "03-console-team-board-collapsed");

  await page.getByLabel("Close team board").first().click();
  await page.waitForTimeout(500);
  await shot(page, "04-console-team-board-closed-again");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
