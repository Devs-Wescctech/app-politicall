import { expect, test as setup } from "@playwright/test";

const adminFile = "playwright/.auth/admin.json";

setup("authenticate development administrator", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("input-email").fill(process.env.E2E_ADMIN_EMAIL ?? "adm@politicall.com.br");
  await page.getByTestId("input-password").fill(process.env.E2E_ADMIN_PASSWORD ?? "admin123");
  await page.getByTestId("button-login").click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("metric-contacts")).toBeVisible();
  await page.context().storageState({ path: adminFile });
});
