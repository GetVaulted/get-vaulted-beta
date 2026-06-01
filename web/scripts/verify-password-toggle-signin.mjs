#!/usr/bin/env node
/** Verify password visibility toggle + sign-in on beta (or SMOKE_BASE_URL). */
const base = (process.env.SMOKE_BASE_URL || "https://beta.shopgetvaulted.com").replace(/\/+$/, "");
const email = process.env.SMOKE_EMAIL || "admin2qa@getvaultedtest.com";
const password = process.env.SMOKE_PASSWORD || "BetaAdmin123!";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright required");
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(`${base}/signin`, { waitUntil: "networkidle" });

const input = page.locator("#signin-password");
const toggle = page.locator('button[aria-controls="signin-password"]');

await input.fill(password);
let typeHidden = await input.getAttribute("type");
let toggleLabel = await toggle.getAttribute("aria-label");
console.log("Default type:", typeHidden, "| toggle label:", toggleLabel);

await toggle.click();
let typeVisible = await input.getAttribute("type");
toggleLabel = await toggle.getAttribute("aria-label");
console.log("After toggle type:", typeVisible, "| toggle label:", toggleLabel);

const valueIntact = (await input.inputValue()) === password;
console.log("Password value intact after toggle:", valueIntact);

await page.locator("#signin-email").fill(email);
const loginPromise = page.waitForResponse((r) => r.url().includes("/api/auth/callback/credentials"));
await page.locator('button[type="submit"]').click();
const loginRes = await loginPromise;
console.log("Sign-in HTTP:", loginRes.status(), "| body:", await loginRes.text());

await page.waitForTimeout(2000);
const session = await page.request.get(`${base}/api/auth/session`);
console.log("Session after login:", JSON.stringify(await session.json(), null, 2));

await browser.close();

const ok =
  typeHidden === "password" &&
  typeVisible === "text" &&
  toggleLabel === "Hide password" &&
  valueIntact &&
  loginRes.status() === 200;

process.exit(ok ? 0 : 1);
