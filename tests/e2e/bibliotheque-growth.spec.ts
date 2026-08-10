import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Story 3.4 — extension des modules", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__e2e__/sauvegarde?scenario=library-growth");
    await expect(page.getByRole("heading", { name: "Bibliothèque physique" })).toBeVisible();
  });

  test("rend 100 exemplaires sur cinq modules sans limite d’interface", async ({ page }) => {
    const reading = page.getByRole("heading", { name: "En cours" }).locator("..");
    await expect(reading.locator(".library-module")).toHaveCount(5);
    await expect(reading.locator(".library-item")).toHaveCount(100);
    await expect(reading.locator(".library-module").nth(4)).toHaveAttribute("aria-label", "Module 5");
    expect(await page.locator("html").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });

  test("conserve l’accessibilité de la collection étendue", async ({ page }) => {
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });
});
