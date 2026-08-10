import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

type HarnessWindow = Window & {
  __mutationHarness?: {
    activeCommandId?: string;
    sentCommandIds: string[];
    pendingCount: () => Promise<number>;
  };
  __saveBudget?: { startedAt: number; savingAt?: number; savedAt?: number; lastMutationAt?: number };
};

const databaseId = (testInfo: TestInfo) =>
  `${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.repeatEachIndex}-${testInfo.retry}-${Date.now()}`;

const harnessUrl = (scenario: string, testInfo: TestInfo, database = databaseId(testInfo)) =>
  `/__e2e__/sauvegarde?scenario=${scenario}&db=${encodeURIComponent(database)}`;

const activate = async (page: Page, action: Locator, testInfo: TestInfo) => {
  await expect(action).toBeEnabled();
  if (testInfo.project.name === "desktop-mouse") {
    await action.click();
    return;
  }
  if (testInfo.project.name === "tablet-touch-portrait") {
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
    return;
  }
  await action.focus();
  await page.keyboard.press("Enter");
};

const observeBudget = (page: Page) => page.evaluate(() => {
  const status = document.querySelector('[data-testid="mutation-state"]');
  const surface = document.querySelector(".save-harness");
  const scope = window as HarnessWindow;
  scope.__saveBudget = { startedAt: performance.now() };
  const observer = new MutationObserver(() => {
    if (!scope.__saveBudget) return;
    scope.__saveBudget.lastMutationAt = performance.now();
    if (status?.textContent === "saving" && scope.__saveBudget.savingAt === undefined) {
      scope.__saveBudget.savingAt = performance.now();
    }
    if (status?.textContent === "saved" && scope.__saveBudget.savedAt === undefined) {
      scope.__saveBudget.savedAt = performance.now();
    }
  });
  if (surface) observer.observe(surface, { childList: true, subtree: true, characterData: true, attributes: true });
});

test("AC 1/4 — 100 éléments reçoivent un retour immédiat puis se stabilisent après le reçu", async ({ page }, testInfo) => {
  await page.goto(harnessUrl("success", testInfo));
  await expect(page.getByTestId("generic-items").locator("li")).toHaveCount(100);
  await observeBudget(page);
  await activate(page, page.getByRole("button", { name: "Tester une sauvegarde" }), testInfo);

  const feedback = page.locator('.mutation-feedback[role="status"]');
  await expect(feedback).toHaveText("Sauvegarde…");
  await expect(page.getByText("Enregistré", { exact: true })).toHaveCount(0);
  await expect(feedback).toHaveText("Enregistré");

  const measurement = await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return (window as HarnessWindow).__saveBudget;
  });
  expect(measurement?.savingAt).toBeDefined();
  expect(measurement?.savedAt).toBeDefined();
  expect(measurement!.savingAt! - measurement!.startedAt).toBeLessThan(100);
  expect(measurement!.savedAt! - measurement!.startedAt).toBeLessThan(500);
  expect(measurement!.lastMutationAt! - measurement!.startedAt).toBeLessThan(500);
});

test("AC 2 — IndexedDB conserve l'intention après reload et le retry garde le commandId", async ({ page }, testInfo) => {
  const database = databaseId(testInfo);
  const url = harnessUrl("failure", testInfo, database);
  await page.goto(url);
  await activate(page, page.getByRole("button", { name: "Tester une sauvegarde" }), testInfo);
  await expect(page.locator('.mutation-feedback[role="alert"]')).toContainText("La sauvegarde n'a pas pu être confirmée.");
  await expect(page.getByText("Enregistré", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as HarnessWindow).__mutationHarness?.pendingCount())).toBe(1);
  const originalCommandId = await page.evaluate(() => (window as HarnessWindow).__mutationHarness?.activeCommandId);

  await page.reload();
  await expect(page.locator('.mutation-feedback[role="alert"]')).toBeVisible();
  expect(await page.evaluate(() => (window as HarnessWindow).__mutationHarness?.pendingCount())).toBe(1);
  expect(await page.evaluate(() => (window as HarnessWindow).__mutationHarness?.activeCommandId)).toBe(originalCommandId);
  await activate(page, page.getByRole("button", { name: "Réessayer" }), testInfo);
  await expect(page.locator('.mutation-feedback[role="status"]')).toHaveText("Enregistré");

  const sentAfterReload = await page.evaluate(() => (window as HarnessWindow).__mutationHarness?.sentCommandIds ?? []);
  expect(sentAfterReload).toEqual([originalCommandId]);
  expect(await page.evaluate(() => (window as HarnessWindow).__mutationHarness?.pendingCount())).toBe(0);
});

test("Review — une erreur définitive peut être abandonnée et purgée", async ({ page }, testInfo) => {
  await page.goto(harnessUrl("rejected", testInfo));
  await activate(page, page.getByRole("button", { name: "Tester une sauvegarde" }), testInfo);
  const abandon = page.getByRole("button", { name: "Abandonner la modification" });
  await expect(abandon).toBeVisible();
  await activate(page, abandon, testInfo);
  await expect(page.getByTestId("mutation-state")).toHaveText("idle");
  expect(await page.evaluate(() => (window as HarnessWindow).__mutationHarness?.pendingCount())).toBe(0);
});

test("AC 3 — le conflit décrit l'écart, restaure le distant et conserve le focus", async ({ page }, testInfo) => {
  await page.goto(harnessUrl("conflict", testInfo));
  await activate(page, page.getByRole("button", { name: "Tester une sauvegarde" }), testInfo);

  const dialog = page.getByRole("alertdialog", { name: "Choisir la version à conserver" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Cette modification diffère de la version enregistrée.");
  await expect(dialog.getByText("Version enregistrée plus récente", { exact: false })).toBeVisible();
  await expect(dialog.getByText("La modification locale sera appliquée", { exact: false })).toBeVisible();
  const keepRemote = dialog.getByRole("button", { name: "Conserver la version enregistrée" });
  await expect(keepRemote).toBeFocused();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await activate(page, keepRemote, testInfo);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("mutation-state")).toHaveText("idle");
  await expect(page.getByRole("button", { name: "Tester une sauvegarde" })).toBeFocused();
});

test("AC 3 — une double activation ne réapplique le local qu'une fois", async ({ page }, testInfo) => {
  await page.goto(harnessUrl("conflict", testInfo));
  await activate(page, page.getByRole("button", { name: "Tester une sauvegarde" }), testInfo);
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  const reapply = dialog.getByRole("button", { name: "Réappliquer mes changements" });
  await reapply.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.locator('.mutation-feedback[role="status"]')).toHaveText("Enregistré");

  const ids = await page.evaluate(() => (window as HarnessWindow).__mutationHarness?.sentCommandIds ?? []);
  expect(ids).toHaveLength(2);
  expect(ids[1]).not.toBe(ids[0]);
  expect(await page.evaluate(() => (window as HarnessWindow).__mutationHarness?.activeCommandId)).toBe(ids[1]);
});

test("AC 4 — zoom 200 %, reflow 320 px, focus deux tons et cibles restent conformes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await page.goto(harnessUrl("conflict", testInfo));
  const browserSession = await page.context().newCDPSession(page);
  await browserSession.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(2);
  await activate(page, page.getByRole("button", { name: "Tester une sauvegarde" }), testInfo);
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Tab");

  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  const layout = await page.evaluate(() => {
    const focused = document.activeElement as HTMLElement | null;
    const style = focused ? getComputedStyle(focused) : null;
    return {
      overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      itemCount: document.querySelectorAll('[data-testid="generic-items"] li').length,
      heights: [...document.querySelectorAll<HTMLButtonElement>("button")].map((button) => button.getBoundingClientRect().height),
      focusOutline: style?.outlineStyle,
      focusShadow: style?.boxShadow,
    };
  });
  expect(layout.overflow).toBe(true);
  expect(layout.itemCount).toBe(100);
  expect(layout.focusOutline).not.toBe("none");
  expect(layout.focusShadow).not.toBe("none");
  expect(Math.min(...layout.heights)).toBeGreaterThanOrEqual(testInfo.project.use.hasTouch ? 48 : 44);

  await browserSession.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await page.setViewportSize({ width: 320, height: 640 });
  const reflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(reflow).toBe(true);
});
