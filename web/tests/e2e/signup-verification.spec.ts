import { expect, test } from "@playwright/test";

/**
 * Full browser flow: signup → /signup/verify (email carried in sessionStorage) → code → auto sign-in → /marketplace.
 * Requires dev server (`npm run dev`) with NODE_ENV=development and no RESEND_API_KEY so register returns `_localDevVerificationCode`.
 */
test.describe("Signup email verification (browser)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("creates account, verifies code, lands logged in on marketplace", async ({ page }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const email = `e2e_signup_${stamp}@test.internal`;
    const username = `pwuser${stamp}`.slice(0, 20);
    const password = "e2e-signup-pass-99";

    await page.goto("/signup", { waitUntil: "domcontentloaded" });

    await page.locator("#join-email").fill(email);
    await page.locator("#join-username").fill(username);
    await page.waitForResponse((r) => r.url().includes("/api/users/check-username"), { timeout: 20_000 });

    await page.locator("#join-password").fill(password);
    await page.locator("#join-password-confirm").fill(password);
    await page.locator('input[name="terms"]').check();

    await expect(page.getByText("Available")).toBeVisible({ timeout: 25_000 });

    const submit = page.getByRole("button", { name: /create account/i });
    await expect(submit).toBeEnabled({ timeout: 5_000 });
    await submit.scrollIntoViewIfNeeded();

    const [regRes] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/register") && res.request().method() === "POST",
        { timeout: 60_000 },
      ),
      submit.click(),
    ]);
    expect(regRes.status()).toBe(200);
    const regJson = (await regRes.json()) as { ok?: boolean; _localDevVerificationCode?: string; error?: string };
    test.skip(
      !regJson._localDevVerificationCode,
      "No _localDevVerificationCode (set NODE_ENV=development and unset RESEND_API_KEY for local OTP in JSON).",
    );
    const code = regJson._localDevVerificationCode!;

    await expect(page).toHaveURL(/\/signup\/verify$/);
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();

    await expect(page.locator("#verify-code")).toBeVisible();
    await expect(page.locator("#join-email")).toHaveCount(0);
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await expect(page.getByText(/no need to retype it/i)).toBeVisible();

    await expect(page.getByText(/local dev only/i)).toBeVisible();
    await expect(page.getByText(code, { exact: true })).toBeVisible();

    await page.locator("#verify-code").fill(code);
    await page.getByRole("button", { name: /verify & continue/i }).click();

    await expect(page).toHaveURL(/\/marketplace/, { timeout: 30_000 });

    await expect(page.getByRole("button", { name: /^sign out$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^join now$/i })).toHaveCount(0);
  });
});
