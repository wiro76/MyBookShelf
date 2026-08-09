import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Story 3.2 — projection des trois bibliothèques", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__e2e__/sauvegarde?scenario=library");
    await expect(page.getByRole("heading", { name: "Bibliothèque physique" })).toBeVisible();
  });

  test("rend statut > module > étagère > exemplaire sans faux livre dans les états vides", async ({ page }) => {
    await expect(page.locator(".library-status-section")).toHaveCount(3);
    await expect(page.locator(".library-module")).toHaveCount(3);
    await expect(page.locator(".library-shelf")).toHaveCount(15);
    await expect(page.locator(".library-item")).toHaveCount(2);
    await expect(page.getByText("Aucun exemplaire placé dans ce statut.")).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Rechercher dans le Catalogue" })).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Ajouter manuellement" })).toHaveCount(3);
  });

  test("focalise l’exemplaire repris et annonce l’ajustement sans UUID privé", async ({ page }) => {
    const target = page.locator("#library-resume-target");
    await expect(target).toBeFocused();
    await expect(page.getByRole("status")).toHaveText("La dernière place est ouverte dans la bibliothèque En cours.");
    const dom = await page.evaluate(() => {
      const root = document.body.cloneNode(true) as HTMLElement;
      for (const node of Array.from(root.querySelectorAll("script, template, noscript"))) node.remove();
      return root.innerHTML;
    });
    expect(dom).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  });

  test("parcourt les tranches avec les flèches et les extrémités", async ({ page }) => {
    const items = page.locator(".library-item");
    await items.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(items.first()).toBeFocused();
    await page.keyboard.press("End");
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    const readingShelves = page.getByRole("heading", { name: "En cours" }).locator("..") .locator(".library-shelf");
    await expect(readingShelves.nth(1)).toBeFocused();
  });

  test("reste accessible sur la branche courante", async ({ page }) => {
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  });
});
