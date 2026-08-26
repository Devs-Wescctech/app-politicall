import { expect, test } from "@playwright/test";

test.describe("critical political office flows", () => {
  test("loads the main authenticated modules without server or console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on("console", message => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("response", response => {
      if (response.status() >= 500) failedResponses.push(`${response.status()} ${response.url()}`);
    });

    const modules = [
      ["/dashboard", "metric-contacts"],
      ["/contacts", "text-contact-count"],
      ["/demands", "button-add-demand"],
      ["/petitions", "card-total-petitions"],
      ["/attendance", "page-attendance"],
    ] as const;

    for (const [path, testId] of modules) {
      await page.goto(path);
      await expect(page.getByTestId(testId)).toBeVisible();
    }

    expect(failedResponses).toEqual([]);
    expect(consoleErrors.filter(error => !error.includes("WebSocket"))).toEqual([]);
  });

  test("creates a contact through the real form", async ({ page }) => {
    await page.goto("/contacts");
    await page.getByTestId("button-add-contact").click();
    await page.getByTestId("input-contact-name").fill("Contato E2E Playwright");
    await page.getByTestId("input-contact-email").fill("e2e.playwright@politicall.test");
    await page.getByTestId("input-contact-phone").fill("51999998888");
    await page.getByTestId("button-save-contact").click();

    await page.getByTestId("input-search-contacts").fill("Contato E2E Playwright");
    await expect(page.getByTestId(/^row-contact-/).filter({ hasText: /Contato E2E Playwright/i })).toBeVisible();
  });

  test("creates a demand with category and responsible operator", async ({ page }) => {
    await page.goto("/demands");
    await page.getByTestId("button-add-demand").click();
    await page.getByTestId("input-demand-title").fill("E2E Playwright - Iluminação pública");
    await page.getByTestId("input-demand-description").fill("Demanda criada automaticamente pela validação E2E.");
    await page.getByTestId("select-demand-category").click();
    await page.getByRole("option").first().click();
    await page.getByTestId("select-demand-assignee").click();
    await page.getByRole("option").first().click();
    await page.getByTestId("button-save-demand").click();

    await expect(page.getByText("E2E Playwright - Iluminação pública", { exact: true })).toBeVisible();
  });

  test("creates a public petition and exposes its public route", async ({ page }) => {
    await page.goto("/petitions");
    await page.getByTestId("button-new-petition").click();
    await page.getByTestId("input-petition-title").fill("Petição E2E Playwright");
    await page.getByTestId("input-petition-slug").fill("e2e-playwright-petition");
    await page.getByTestId("input-petition-description").fill("Validação automatizada da jornada pública de petições.");
    await page.getByTestId("input-petition-goal").fill("100");
    await page.getByTestId("select-petition-status").click();
    await page.getByRole("option", { name: /publicad/i }).click();
    await page.getByTestId("button-save-petition").click();

    await expect(page.getByText("Petição E2E Playwright", { exact: true })).toBeVisible();
    await page.goto("/p/e2e-playwright-petition");
    await expect(page.getByText("Petição E2E Playwright", { exact: true })).toBeVisible();
  });

  test("keeps campaign management out of the Petitions module", async ({ page }) => {
    await page.goto("/petitions");

    await expect(page.getByTestId("tab-petitions")).toBeVisible();
    await expect(page.getByTestId("tab-linkbio")).toBeVisible();
    await expect(page.getByTestId("tab-linktree")).toBeVisible();
    await expect(page.getByTestId("tab-campaigns")).toHaveCount(0);
    await expect(page.getByTestId("tab-templates")).toHaveCount(0);
  });

  test("assumes an attendance immediately and preserves the provider local time", async ({ page }) => {
    await page.goto("/attendance");
    const conversation = page.getByTestId("item-conversation-e2e-attendance-conversation");
    await expect(conversation).toBeVisible();
    await conversation.click();
    await expect(page.getByText("10:15", { exact: true })).toBeVisible();
    await page.getByTestId("button-assume-conversation").click();

    await expect(page.getByTestId("lane-items-manual").getByTestId("item-conversation-e2e-attendance-conversation"))
      .toBeVisible();
  });
});
