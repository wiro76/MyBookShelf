import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("la page ne présente aucune violation WCAG A/AA automatisable", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("les garanties d'interaction disponibles sont observables", async ({ page }, testInfo) => {
  await page.goto("/");
  const action = page.getByRole("link", { name: "Voir l’état du projet" });
  await expect(action).toHaveAccessibleName("Voir l’état du projet");

  if (testInfo.project.name.includes("keyboard")) {
    await action.focus();
    await expect(action).toBeFocused();
    await expect(action).toHaveCSS("outline-style", "solid");
  } else if (testInfo.project.name.includes("touch")) {
    expect(testInfo.project.use.hasTouch).toBe(true);
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(page).toHaveURL(/\/etat-du-projet$/);
  } else {
    await action.click();
    await expect(page).toHaveURL(/\/etat-du-projet$/);
  }

  const invariants = await page.evaluate(() => {
    const root = document.documentElement;
    const link = document.querySelector("a.primary-action");
    return {
      overflow: root.scrollWidth <= root.clientWidth,
      targetHeight: link?.getBoundingClientRect().height ?? 0,
    };
  });
  expect(invariants.overflow).toBe(true);
  // Plancher de cible : 44px au pointeur, 48px au TACTILE. Il se lit désormais sur la
  // capacité réelle du projet et non sur son nom : `tablet-keyboard-landscape`, réparé par la
  // story 1.6, est un appareil tactile piloté au clavier — le nommer « keyboard » ne lui retire
  // pas son écran tactile, et l'ancienne condition sur le nom lui appliquait le plancher du
  // pointeur.
  expect(invariants.targetHeight).toBeGreaterThanOrEqual(testInfo.project.use.hasTouch ? 48 : 44);
});

test("la préférence de réduction des animations est appliquée", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const durationMs = await page.getByRole("link", { name: "Voir l’état du projet" }).evaluate((element) => {
    const duration = getComputedStyle(element).transitionDuration;
    return Number.parseFloat(duration) * (duration.endsWith("ms") ? 1 : 1000);
  });
  expect(durationMs).toBeLessThanOrEqual(0.01);
});

test("le zoom 200 % reste utilisable sans défilement horizontal", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { document.body.style.zoom = "2"; });
  const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  await expect(page.getByRole("link", { name: "Voir l’état du projet" })).toBeVisible();
});

test("le reflow 400 % à 320 CSS px et l'espacement personnalisé restent utilisables", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.addStyleTag({ content: "* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }" });
  const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  await expect(page.getByRole("link", { name: "Voir l’état du projet" })).toBeVisible();
});
