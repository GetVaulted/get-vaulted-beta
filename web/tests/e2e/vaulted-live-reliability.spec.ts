import { expect, test } from "@playwright/test";

const ROOM_ID = process.env.LIVE_TEST_ROOM_ID ?? "";
const SELLER_EMAIL = process.env.LIVE_TEST_SELLER_EMAIL ?? "";
const SELLER_PASSWORD = process.env.LIVE_TEST_SELLER_PASSWORD ?? "";
const BUYER_EMAIL = process.env.LIVE_TEST_BUYER_EMAIL ?? "";
const BUYER_PASSWORD = process.env.LIVE_TEST_BUYER_PASSWORD ?? "";

const HAS_ENV =
  ROOM_ID.trim().length > 0 &&
  SELLER_EMAIL.trim().length > 0 &&
  SELLER_PASSWORD.trim().length > 0 &&
  BUYER_EMAIL.trim().length > 0 &&
  BUYER_PASSWORD.trim().length > 0;

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/signin", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForLoadState("networkidle");
}

test.describe("Vaulted Live reliability smoke", () => {
  test.skip(!HAS_ENV, "Missing LIVE_TEST_* environment variables for E2E smoke.");

  test("syncs buyer/seller flow with reconnect refresh", async ({ browser }) => {
    const sellerContext = await browser.newContext();
    const buyerContext = await browser.newContext();
    const sellerConsole = await sellerContext.newPage();
    const sellerLive = await sellerContext.newPage();
    const buyerLive = await buyerContext.newPage();

    try {
      await signIn(sellerConsole, SELLER_EMAIL, SELLER_PASSWORD);
      await signIn(buyerLive, BUYER_EMAIL, BUYER_PASSWORD);

      await Promise.all([
        sellerConsole.goto(`/seller/live/${encodeURIComponent(ROOM_ID)}/console`, { waitUntil: "domcontentloaded" }),
        sellerLive.goto(`/live/${encodeURIComponent(ROOM_ID)}`, { waitUntil: "domcontentloaded" }),
        buyerLive.goto(`/live/${encodeURIComponent(ROOM_ID)}`, { waitUntil: "domcontentloaded" }),
      ]);

      await sellerConsole.getByRole("button", { name: /start room/i }).click();
      await expect(buyerLive.getByTestId("live-status-pill")).toContainText(/live/i);

      const chatText = `e2e-${Date.now()}`;
      await buyerLive.getByTestId("live-chat-input").fill(chatText);
      await buyerLive.getByTestId("live-chat-send").click();
      await expect(buyerLive.getByTestId("live-chat-messages")).toContainText(chatText);

      const hostLine = `host-e2e-${Date.now()}`;
      await sellerConsole.getByPlaceholder("Push a line to the room…").fill(hostLine);
      await sellerConsole.getByRole("button", { name: /send to chat/i }).click();
      await expect(buyerLive.getByTestId("live-chat-messages")).toContainText(hostLine);

      await expect(buyerLive.getByTestId("live-viewer-count")).toContainText(/watching|waiting/i);
      await expect(buyerLive.getByTestId("live-active-item-title")).toBeVisible();

      const bidButton = buyerLive.getByTestId("live-bid-button").first();
      const previousBidLabel = await bidButton.textContent();
      await bidButton.click();
      await expect
        .poll(async () => (await bidButton.textContent())?.trim() ?? "", { timeout: 20_000 })
        .not.toBe((previousBidLabel ?? "").trim());

      await buyerLive.reload({ waitUntil: "networkidle" });
      await expect(buyerLive.getByTestId("live-active-item-title")).toBeVisible();
      await expect(buyerLive.getByTestId("live-status-pill")).toContainText(/live|upcoming|starts in/i);

      await sellerConsole.getByRole("button", { name: /end room/i }).click();
      await expect(buyerLive.getByTestId("live-status-pill")).toContainText(/ended|upcoming/i);
    } finally {
      await sellerContext.close();
      await buyerContext.close();
    }
  });
});
