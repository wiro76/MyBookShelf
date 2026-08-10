import { expect, test } from "@playwright/test";

test("rend un accueil utile et navigable au clavier", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "My BookShelf" })).toBeVisible();
  await expect(page.getByText(/Le socle privé, le Catalogue/)).toBeVisible();
  await expect(page.locator("article")).toHaveCount(0);

  const action = page.getByRole("link", { name: "Voir l’état du projet" });
  await action.focus();
  await expect(action).toBeFocused();
  await expect(action).toHaveCSS("outline-style", "solid");

  await action.press("Enter");
  await expect(page).toHaveURL(/\/etat-du-projet$/);
});

test("conserve le contenu sans débordement à 200 % et à 320 CSS px", async ({ page }) => {
  await page.goto("/");

  for (const viewport of [
    { width: 640, height: 450 },
    { width: 320, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { name: "My BookShelf" })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  }
});
