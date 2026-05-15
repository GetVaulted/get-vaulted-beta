#!/usr/bin/env node
/**
 * Optional dual-context Playwright smoke runner for Vaulted Live.
 *
 * Prereq:
 *   npm i -D @playwright/test
 *   npx playwright install
 *
 * Usage:
 *   node scripts/live-smoke-playwright.mjs --room <roomId> --buyerEmail <email> --buyerPass <pass> --sellerEmail <email> --sellerPass <pass>
 */

const args = process.argv.slice(2);
const getArg = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};

const roomId = getArg("room");
const buyerEmail = getArg("buyerEmail");
const buyerPass = getArg("buyerPass");
const sellerEmail = getArg("sellerEmail");
const sellerPass = getArg("sellerPass");
const baseUrl = process.env.BASE_URL || "http://localhost:3000";

if (!roomId) {
  console.error("Missing --room <roomId>");
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Install with: npm i -D @playwright/test && npx playwright install");
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const sellerCtx = await browser.newContext();
const buyerCtx = await browser.newContext();
const sellerPage = await sellerCtx.newPage();
const buyerPage = await buyerCtx.newPage();

async function signIn(page, email, password) {
  if (!email || !password) return;
  await page.goto(`${baseUrl}/signin`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
}

try {
  await signIn(sellerPage, sellerEmail, sellerPass);
  await signIn(buyerPage, buyerEmail, buyerPass);

  await Promise.all([
    sellerPage.goto(`${baseUrl}/live/${encodeURIComponent(roomId)}`, { waitUntil: "domcontentloaded" }),
    buyerPage.goto(`${baseUrl}/live/${encodeURIComponent(roomId)}`, { waitUntil: "domcontentloaded" }),
  ]);

  console.log("Opened buyer + seller live room pages.");
  console.log("Manual assertions to verify in CI logs/screenshots:");
  console.log("- chat send/receive");
  console.log("- viewer count presence");
  console.log("- seller start/end room");
  console.log("- buyer bid updates seller");
  console.log("- reconnect refresh behavior");
  console.log("- stale bid rejection");
} finally {
  await sellerCtx.close();
  await buyerCtx.close();
  await browser.close();
}
