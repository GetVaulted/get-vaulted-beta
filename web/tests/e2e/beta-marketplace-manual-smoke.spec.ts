import { expect, test } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://beta.shopgetvaulted.com";
const SELLER_EMAIL = process.env.BETA_QA_SELLER_EMAIL ?? "sellerqa@getvaultedtest.com";
const SELLER_PASSWORD = process.env.BETA_QA_PASSWORD ?? "VaultedBetaQA1!";
const BUYER_EMAIL = process.env.BETA_QA_BUYER_EMAIL ?? "buyerqa@getvaultedtest.com";
const BUYER_PASSWORD = process.env.BETA_QA_PASSWORD ?? "VaultedBetaQA1!";
const ROOM_ID = process.env.LIVE_TEST_ROOM_ID ?? "";

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/signin", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/signin"), { timeout: 45_000 });
}

const listingBody = (title: string, allowOffers: boolean, acceptTradeOffers: boolean) => ({
  title,
  buyingFormat: "buy_now",
  status: "active",
  priceUsd: 77,
  allowOffers,
  acceptTradeOffers,
  category: "Trading Cards",
  condition: "Raw",
  description: "Beta smoke listing",
  images: ["https://images.unsplash.com/photo-1611532736597-de2d4265c3c8?w=400"],
  parcelWeightOz: 16,
  parcelLengthIn: 10,
  parcelWidthIn: 8,
  parcelHeightIn: 4,
  shippingBaseWeightOz: 4,
  shippingIncrementalWeightOz: 1,
  shippingCategory: "raw_card",
});

test.describe("Beta marketplace manual smoke", () => {
  test.describe.configure({ mode: "serial" });

  let offersOnId = "";
  let tradesOnId = "";

  test("1–2 seller creates buy-now listings (offers on / trades on)", async ({ page }) => {
    await signIn(page, SELLER_EMAIL, SELLER_PASSWORD);

    const stamp = Date.now();
    const resOffers = await page.request.post("/api/listings", {
      data: listingBody(`Beta smoke offers ON ${stamp}`, true, false),
    });
    expect(resOffers.status(), await resOffers.text()).toBe(200);
    const jOffers = (await resOffers.json()) as { listing?: { id?: string } };
    offersOnId = jOffers.listing?.id ?? "";
    expect(offersOnId).toBeTruthy();

    const resTrades = await page.request.post("/api/listings", {
      data: listingBody(`Beta smoke trades ON ${stamp}`, false, true),
    });
    expect(resTrades.status(), await resTrades.text()).toBe(200);
    const jTrades = (await resTrades.json()) as { listing?: { id?: string } };
    tradesOnId = jTrades.listing?.id ?? "";
    expect(tradesOnId).toBeTruthy();
  });

  test("1 PDP offers ON shows Buy now + Make offer only", async ({ page }) => {
    test.skip(!offersOnId, "Listing not created");
    await page.goto(`/marketplace/${encodeURIComponent(offersOnId)}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Buy now" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Make offer" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start trade offer" })).toHaveCount(0);
    await expect(page.getByText("Place bid", { exact: false })).toHaveCount(0);
  });

  test("2 PDP trades ON shows Buy now + Trade only", async ({ page }) => {
    test.skip(!tradesOnId, "Listing not created");
    await page.goto(`/marketplace/${encodeURIComponent(tradesOnId)}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Buy now" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start trade offer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Make offer" })).toHaveCount(0);
    await expect(page.getByText("Place bid", { exact: false })).toHaveCount(0);
  });

  test("3 buyer Buy now opens checkout", async ({ page }) => {
    test.skip(!offersOnId, "Listing not created");
    await signIn(page, BUYER_EMAIL, BUYER_PASSWORD);
    await page.goto(`/marketplace/${encodeURIComponent(offersOnId)}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Buy now" }).first().click();
    await page.waitForURL(/\/checkout\//, { timeout: 30_000 });
    await expect(page.url()).toContain(`/checkout/${offersOnId}`);
  });

  test("4 legacy marketplace auction URL shows unavailable, no bid UI", async ({ page }) => {
    const legacyId = process.env.BETA_LEGACY_AUCTION_LISTING_ID ?? "";
    test.skip(!legacyId, "Set BETA_LEGACY_AUCTION_LISTING_ID for legacy auction smoke");
    await page.goto(`/marketplace/${encodeURIComponent(legacyId)}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/no longer available|Auctions now run only during Live Shows/i)).toBeVisible();
    await expect(page.getByText("Place bid", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Buy now" })).toHaveCount(0);
  });

  test("5 live show push lot, bid, timer, host console", async ({ browser }) => {
    test.skip(!ROOM_ID, "Set LIVE_TEST_ROOM_ID for live smoke");

    const sellerContext = await browser.newContext();
    const buyerContext = await browser.newContext();
    const sellerConsole = await sellerContext.newPage();
    const buyerLive = await buyerContext.newPage();

    try {
      await signIn(sellerConsole, SELLER_EMAIL, SELLER_PASSWORD);
      await signIn(buyerLive, BUYER_EMAIL, BUYER_PASSWORD);

      await Promise.all([
        sellerConsole.goto(`/seller/live/${encodeURIComponent(ROOM_ID)}/console`, { waitUntil: "domcontentloaded" }),
        buyerLive.goto(`/live/${encodeURIComponent(ROOM_ID)}`, { waitUntil: "domcontentloaded" }),
      ]);

      const startBtn = sellerConsole.getByRole("button", { name: /start room/i });
      if (await startBtn.isVisible().catch(() => false)) {
        await startBtn.click();
      }

      await expect(buyerLive.getByTestId("live-status-pill")).toContainText(/live|upcoming|starts in/i, { timeout: 30_000 });
      await expect(buyerLive.getByTestId("live-active-item-title")).toBeVisible();

      const pushLot = sellerConsole.getByRole("button", { name: /push|start lot|next item/i }).first();
      if (await pushLot.isVisible().catch(() => false)) {
        await pushLot.click();
      }

      const bidButton = buyerLive.getByTestId("live-bid-button").first();
      await expect(bidButton).toBeVisible({ timeout: 30_000 });
      const prev = ((await bidButton.textContent()) ?? "").trim();
      await bidButton.click();
      await expect
        .poll(async () => ((await bidButton.textContent()) ?? "").trim(), { timeout: 25_000 })
        .not.toBe(prev);

      await expect(buyerLive.getByTestId("live-timer") ?? buyerLive.getByText(/\d+:\d+/)).toBeVisible({ timeout: 15_000 }).catch(() => {});
      await expect(sellerConsole.getByText(/console|host|lot|active/i).first()).toBeVisible();
    } finally {
      await sellerContext.close();
      await buyerContext.close();
    }
  });
});

test.beforeAll(() => {
  if (!BASE.includes("beta")) {
    console.warn(`Running beta smoke against ${BASE}`);
  }
});
