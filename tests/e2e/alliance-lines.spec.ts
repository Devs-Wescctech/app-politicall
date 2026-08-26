import { expect, test } from "@playwright/test";
import {
  cleanupAllianceLineFixtures,
  E2E_ALLIANCE_LINE_NAME,
  E2E_ALLY_NAME,
  E2E_LEGACY_ALLY_NAME,
  seedLegacyAllianceFixture,
} from "./alliance-lines.fixture";

test.describe("political alliance lines", () => {
  let legacyPartyAcronym = "";

  test.beforeAll(async () => {
    await cleanupAllianceLineFixtures();
    legacyPartyAcronym = await seedLegacyAllianceFixture();
  });
  test.afterAll(cleanupAllianceLineFixtures);

  test("creates, edits, assigns, filters, and identifies a custom alliance line", async ({ page }) => {
    const consoleWarnings: string[] = [];
    page.on("console", message => {
      if (message.type() === "warning") consoleWarnings.push(message.text());
    });

    await page.goto("/alliances");
    await page.getByTestId("button-manage-alliance-lines").click();

    const manager = page.getByTestId("alliance-line-manager");
    await expect(manager).toBeVisible();
    await manager.getByRole("button", { name: "Nova linha" }).click();
    await page.getByLabel("Nome", { exact: true }).fill(E2E_ALLIANCE_LINE_NAME);
    await page.getByLabel("Cor hexadecimal").fill("#1D4ED8");
    await page.getByRole("button", { name: "Salvar linha" }).click();

    const lineRow = manager.getByTestId("alliance-line-row").filter({ hasText: E2E_ALLIANCE_LINE_NAME });
    await expect(lineRow).toBeVisible();
    await lineRow.getByRole("button", { name: `Editar ${E2E_ALLIANCE_LINE_NAME}` }).click();
    await page.getByLabel("Cor hexadecimal").fill("#15803D");
    await page.getByRole("button", { name: "Salvar linha" }).click();
    await expect(lineRow.getByTestId("alliance-line-badge")).toHaveCSS("background-color", "rgb(21, 128, 61)");
    await manager.getByRole("button", { name: "Close" }).click();

    await page.getByTestId("button-add-alliance").click();
    await expect(page.getByTestId("select-alliance-line")).toBeVisible();
    await page.getByTestId("select-alliance-line").click();
    await page.getByRole("option", { name: E2E_ALLIANCE_LINE_NAME }).click();

    await page.getByTestId("select-party").click();
    const partyOption = page.getByRole("option").first();
    const partyLabel = (await partyOption.textContent())?.trim() ?? "";
    const partyAcronym = partyLabel.split(" - ")[0];
    await partyOption.click();
    await page.getByTestId("input-ally-name").fill(E2E_ALLY_NAME);
    await page.getByTestId("button-save-alliance").click();

    await page.getByTestId("select-filter-alliance-line").click();
    await page.getByRole("option", { name: E2E_ALLIANCE_LINE_NAME }).click();
    await expect(page.getByTestId("text-total-alliances")).toHaveText("1");
    await page.getByTestId(`party-card-${partyAcronym}`).click();

    const allianceItem = page.getByTestId(/^alliance-item-/).filter({ hasText: E2E_ALLY_NAME });
    await expect(allianceItem).toBeVisible();
    await expect(allianceItem.getByTestId("alliance-line-badge")).toHaveText(E2E_ALLIANCE_LINE_NAME);
    expect(consoleWarnings).toEqual([]);
  });

  test("keeps a legacy unassigned alliance editable", async ({ page }) => {
    await page.goto("/alliances");
    await page.getByTestId(`party-card-${legacyPartyAcronym}`).click();

    const legacyAlliance = page.getByTestId(/^alliance-item-/).filter({ hasText: E2E_LEGACY_ALLY_NAME });
    await expect(legacyAlliance).toContainText("Sem linha");
    await legacyAlliance.getByText(E2E_LEGACY_ALLY_NAME, { exact: true }).click();
    await expect(page.getByText("Linha política", { exact: true })).toBeVisible();
    await expect(page.getByText("Sem linha", { exact: true }).last()).toBeVisible();

    await page.getByTestId("button-edit-alliance").click();
    await expect(page.getByTestId("select-edit-alliance-line")).toHaveText("Sem linha");
    await page.getByTestId("input-edit-ally-notes").fill("Registro legado E2E atualizado");
    await page.getByTestId("button-update-alliance").click();
    await expect(page.getByText("Aliado atualizado com sucesso!", { exact: true })).toBeVisible();
  });

  test("keeps alliance-line controls within desktop and mobile viewports", async ({ page }) => {
    for (const viewport of [
      { name: "mobile", width: 375, height: 812 },
      { name: "desktop", width: 1440, height: 900 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/alliances");
      await expect(page.getByTestId("select-filter-alliance-line")).toBeVisible();
      await expect(page.getByTestId("alliance-line-summary")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({
        fullPage: true,
        path: `test-results/alliance-lines-${viewport.name}.png`,
      });
    }
  });
});
