import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { COMPTES } from "./faux-service-auth.mjs";

async function ouvrirCatalogue(page: Page) {
  await page.goto("/connexion?destination=%2Fcatalogue");
  await page.locator("#champ-email").fill(COMPTES.valide.email);
  await page.locator("#champ-mot-de-passe").fill(COMPTES.valide.password);
  await page.getByRole("button", { name: /connecter/i }).click();
  await expect(page).toHaveURL(/\/catalogue$/);
  await expect(page.getByRole("heading", { name: "Catalogue", exact: true })).toBeVisible();
}

async function rechercher(page: Page, query: string, mode: "Titre" | "Auteur" = "Titre") {
  await page.getByRole("radio", { name: mode }).check();
  await page.getByLabel(mode === "Titre" ? "Titre de l’œuvre" : "Nom de l’auteur").fill(query);
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
}

test("sans session, le Catalogue redirige sans appeler les fournisseurs", async ({ page }) => {
  await page.request.get("http://127.0.0.1:3102/reset");
  await page.goto("/catalogue");
  await expect(page).toHaveURL(/\/connexion\?destination=%2Fcatalogue$/);
  const health = await page.request.get("http://127.0.0.1:3102/sante");
  expect((await health.json()).calls).toEqual([]);
});

test("recherche par titre, priorité Google et fiche non mutante au pointeur ou au tactile", async ({ page }, testInfo) => {
  await ouvrirCatalogue(page);
  await rechercher(page, "Le Comte de Monte-Cristo");
  await expect(page.getByText("1 résultat.", { exact: true })).toBeVisible();
  const result = page.getByRole("button", { name: /Le Comte de Monte-Cristo/ }).first();
  await expect(result).toContainText("Google Books");
  if (testInfo.project.use.hasTouch) {
    const box = await result.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  } else {
    await result.click();
  }
  await expect(page.getByRole("heading", { name: "Le Comte de Monte-Cristo", exact: true })).toBeFocused();
  await expect(page.getByText("Google Books, Open Library, BnF", { exact: true })).toBeVisible();
  await expect(page.getByText(/1488 pages/)).toBeVisible();
  await expect(page.getByText(/Rien n’a été ajouté/)).toBeVisible();
  await expect(page.getByRole("button", { name: /ajout|ajouter/i })).toHaveCount(0);
  await result.focus();
  await result.click();
  await expect(page.getByRole("heading", { name: "Le Comte de Monte-Cristo", exact: true })).toBeFocused();
});

test("recherche par auteur et ouverture de la fiche au clavier", async ({ page }) => {
  await ouvrirCatalogue(page);
  await rechercher(page, "Alexandre Dumas", "Auteur");
  const result = page.getByRole("button", { name: /Le Comte de Monte-Cristo/ }).first();
  await result.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Le Comte de Monte-Cristo", exact: true })).toBeFocused();
});

test("empty conserve la requête et prépare le transfert manuel", async ({ page }) => {
  await ouvrirCatalogue(page);
  await rechercher(page, "introuvable");
  await expect(page.getByText("Aucun résultat dans les trois sources.")).toBeVisible();
  await page.getByRole("link", { name: "Préparer un ajout manuel" }).click();
  await expect(page).toHaveURL(/\/catalogue\/ajout-manuel\?mode=title&q=introuvable$/);
  await expect(page.getByText("introuvable", { exact: true })).toBeVisible();
  await expect(page.getByText(/Story 2.6/)).toBeVisible();
  await expect(page.getByRole("button", { name: /créer|enregistrer/i })).toHaveCount(0);
});

test("partial et unavailable restent stables et réessayables", async ({ page }) => {
  await ouvrirCatalogue(page);
  await rechercher(page, "partiel");
  await expect(page.getByText(/Résultats partiels/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
  await expect(page.getByLabel("Titre de l’œuvre")).toHaveValue("partiel");

  await page.getByLabel("Titre de l’œuvre").fill("indisponible");
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByText(/Résultats partiels/)).toBeVisible();
  await expect(page.getByLabel("Titre de l’œuvre")).toHaveValue("indisponible");
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(page.getByText("Le Catalogue est indisponible pour le moment.")).toBeVisible();
  await expect(page.getByText(/texte fournisseur interdit|503|127\.0\.0\.1/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
});

test("validation, accessibilité, zoom et reflow restent utilisables avec une fiche", async ({ page }, testInfo) => {
  await ouvrirCatalogue(page);
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(page.locator("#catalog-query-error")).toContainText("1 et 200");
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(audit.violations).toEqual([]);

  await rechercher(page, "Le Comte de Monte-Cristo");
  await page.getByRole("button", { name: /Le Comte de Monte-Cristo/ }).first().click();

  const viewport = testInfo.project.use.viewport;
  expect(viewport).toBeTruthy();
  await page.setViewportSize({ width: Math.round(viewport!.width / 2), height: Math.round(viewport!.height / 2) });
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole("heading", { name: "Le Comte de Monte-Cristo", exact: true })).toBeVisible();

  await page.setViewportSize({ width: 320, height: 640 });
  await page.addStyleTag({ content: "* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p, label { margin-bottom: 2em !important; }" });
  overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByLabel("Titre de l’œuvre")).toBeVisible();
});
