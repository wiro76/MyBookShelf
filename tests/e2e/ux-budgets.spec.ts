import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("100 éléments respectent feedback, stabilisation et invariants spatiaux", async ({ page }) => {
  await page.setContent(await readFile("tests/fixtures/ux-budget.html", "utf8"));
  const result = await page.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>("#reorder")!;
    const list = document.querySelector<HTMLElement>("#fixture-list")!;
    const before = [...list.children].map((element) => (element as HTMLElement).dataset.id!);
    const started = performance.now();
    let feedbackObserved = Number.POSITIVE_INFINITY;
    const feedback = document.querySelector("#feedback")!;
    const feedbackObserver = new MutationObserver(() => { feedbackObserved = performance.now(); });
    feedbackObserver.observe(feedback, { childList: true, characterData: true, subtree: true });
    let geometryMutationObserved = false;
    const geometryObserver = new MutationObserver(() => { geometryMutationObserved = true; });
    geometryObserver.observe(list, { childList: true, subtree: true, attributes: true });
    button.click();
    const stableObserved = await new Promise<number>((resolve, reject) => {
      const deadline = started + 750;
      let previous = [...list.children].map((element) => (element as HTMLElement).getBoundingClientRect().toJSON());
      let equalFrames = 0;
      const sample = () => {
        const current = [...list.children].map((element) => (element as HTMLElement).getBoundingClientRect().toJSON());
        if (geometryMutationObserved && JSON.stringify(current) === JSON.stringify(previous)) equalFrames += 1;
        else equalFrames = 0;
        previous = current;
        if (equalFrames >= 2) return resolve(performance.now());
        if (performance.now() > deadline) return reject(new Error("la géométrie ne s'est pas stabilisée"));
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    feedbackObserver.disconnect();
    geometryObserver.disconnect();
    const boxes = [...list.children].map((element) => element.getBoundingClientRect());
    const after = [...list.children].map((element) => (element as HTMLElement).dataset.id!);
    const remainingBefore = before.filter((id) => id !== before[0]);
    const remainingAfter = after.filter((id) => id !== before[0]);
    return {
      feedback: feedbackObserved - started,
      stable: stableObserved - started,
      relativeOrder: JSON.stringify(remainingBefore) === JSON.stringify(remainingAfter),
      moved: after.at(-1) === before[0],
      noOverflow: list.scrollWidth <= list.clientWidth,
      noOverlap: boxes.every((box, index) => index === 0 || box.top >= boxes[index - 1].bottom),
    };
  });

  expect(result.feedback).toBeLessThanOrEqual(100);
  expect(result.stable).toBeLessThanOrEqual(500);
  expect(result.relativeOrder).toBe(true);
  expect(result.moved).toBe(true);
  expect(result.noOverflow).toBe(true);
  expect(result.noOverlap).toBe(true);
});
