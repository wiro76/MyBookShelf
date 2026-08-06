import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { COMPTES } from "./faux-service-auth.mjs";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

const connect = async (page: Page) => {
  await page.goto("/connexion?destination=%2Fbibliotheque");
  await page.locator("#champ-email").fill(COMPTES.valide.email);
  await page.locator("#champ-mot-de-passe").fill(COMPTES.valide.password);
  await page.getByRole("button", { name: /connecter/i }).click();
  await expect(page).toHaveURL(/\/bibliotheque$/);
};

test("AC 3/4 — la reconnexion reprend une destination non sensible et une panne conserve la session", async ({ page }) => {
  await connect(page);

  const url = new URL(page.url());
  expect(url.pathname).toBe("/bibliotheque");
  expect(url.search).toBe("");
  expect(url.hash).toBe("");
  expect(page.url()).not.toMatch(UUID);

  await expect(page.getByText(/n’a pas pu reprendre sa dernière position/i)).toBeVisible();
  const retry = page.getByRole("link", { name: "Réessayer" });
  await expect(retry).toHaveAttribute("href", "/bibliotheque");

  const rendered = await page.locator("body").innerText();
  expect(rendered).not.toMatch(UUID);
  expect(rendered).not.toContain(COMPTES.valide.email);

  await retry.click();
  await expect(page).toHaveURL(/\/bibliotheque$/);
  await expect(page.getByText(/n’a pas pu reprendre sa dernière position/i)).toBeVisible();
  await expect(page.locator("#champ-email")).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
