import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import run from "../src/fixtures/run.json" with { type: "json" };

const live = process.env.E2E_LIVE === "1";

/** Any request to a non-local host fails the test (unless E2E_LIVE=1). */
async function blockExternal(page: Page): Promise<string[]> {
  const blocked: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (live || ["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    blocked.push(url.href);
    return route.abort();
  });
  return blocked;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("smoke: home loads in DEMO MODE", async ({ page }) => {
  const blocked = await blockExternal(page);
  await page.goto("/");
  await expect(page.getByTestId("mode-badge")).toContainText("DEMO MODE");
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await expect(page.getByTestId("stat-tracked")).toHaveText(String(run.stats.records_created));
  expect(blocked).toEqual([]);
});

test("console: run, retry, refused", async ({ page }) => {
  await blockExternal(page);
  await page.goto("/console");
  await expect(page.getByTestId("console-empty")).toBeVisible();
  await page.getByTestId("run-payment").click();
  await expect(page.getByTestId("timeline-skeleton")).toBeVisible();
  await expect(page.getByTestId("step-settled")).toBeVisible();
  await page.getByTestId("retry-same-key").click();
  await expect(page.getByTestId("refused-card")).toBeVisible();
  await expect(page.getByTestId("refused-refund-link")).toBeVisible();
});

test("golden: home -> console -> receipt -> verify -> outcomes -> pricing", async ({ page }) => {
  const blocked = await blockExternal(page);
  await page.goto("/");
  await expect(page.getByTestId("mode-badge")).toContainText("DEMO MODE");
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await expect(page.getByTestId("stat-tracked")).toHaveText(String(run.stats.records_created));

  await page.getByTestId("nav-console").click();
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await expect(page.getByTestId("console-empty")).toBeVisible();
  await page.keyboard.press("Tab");
  await page.getByTestId("run-payment").focus();
  const ring = await page.getByTestId("run-payment").evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(ring).toBe("solid");
  await page.getByTestId("run-payment").click();
  await expect(page.getByTestId("step-settled")).toBeVisible();
  await page.getByTestId("retry-same-key").click();
  await expect(page.getByTestId("refused-card")).toBeVisible();
  await expect(page.getByTestId("refused-refund-link")).toBeVisible();

  await page.getByTestId("open-receipt").click();
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await expect(page.getByTestId("receipt-outcome")).toHaveText("SETTLED");
  for (const id of ["record", "deposit", "destination", "quote-hash"]) {
    await expect(page.getByTestId(`receipt-link-${id}`)).toHaveAttribute("href", /.+/);
  }
  await page.getByTestId("verify-onchain").click();
  await expect(page.getByTestId("verify-result")).toContainText("MATCH");

  await page.getByTestId("nav-outcomes").click();
  await expect(page.getByTestId("outcome-failed-no-refund")).toBeVisible();
  await expect(page.getByTestId("outcome-label-recorded")).toBeVisible();
  await expect(page.getByTestId("outcome-refunded")).toContainText("not demonstrated");

  await page.goto("/");
  await page.getByTestId("pricing-hypothesis").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("pricing-not-charging")).toContainText("Hypothesis. Not charging.");

  await page.setViewportSize({ width: 375, height: 812 });
  await noHorizontalScroll(page);
  expect(blocked).toEqual([]);
});

test("receipt: unknown key shows the empty state", async ({ page }) => {
  await blockExternal(page);
  await page.goto(`/r/${run.payer}/no-such-key`);
  await expect(page.getByTestId("receipt-empty")).toBeVisible();
});

const pages = ["/", "/console", `/r/${run.payer}/${run.key}`, "/outcomes"];
for (const width of [1280, 375]) {
  test(`a11y: no serious or critical violations at ${width} px`, async ({ page }) => {
    await blockExternal(page);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
        type R = { x: number; y: number; width: number; height: number };
        type Shift = { value: number; startTime: number; hadRecentInput: boolean; sources: { node?: Element; previousRect: R; currentRect: R }[] };
        const w = window as unknown as { __cls: number; __shifted: string[] };
        w.__cls = 0;
        w.__shifted = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as Shift[]) {
            if (e.hadRecentInput) continue;
            w.__cls += e.value;
            for (const s of e.sources) {
              const n = s.node;
              const p = s.previousRect, c = s.currentRect;
              w.__shifted.push(
                `${n ? n.nodeName + "." + (n as HTMLElement).className : "?"} t=${Math.round(e.startTime)} v=${e.value.toFixed(3)} ` +
                  `${Math.round(p.x)},${Math.round(p.y)} ${Math.round(p.width)}x${Math.round(p.height)} -> ${Math.round(c.x)},${Math.round(c.y)} ${Math.round(c.width)}x${Math.round(c.height)}`,
              );
            }
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${path}: ${v.id} ${v.help} [${v.nodes.slice(0, 6).map((n) => n.target.join(" ")).join(" | ")}]`)).toEqual([]);
      await noHorizontalScroll(page);
      const { cls, shifted } = await page.evaluate(() => {
        const w = window as unknown as { __cls: number; __shifted: string[] };
        return { cls: w.__cls, shifted: w.__shifted };
      });
      expect(cls, `layout shift on ${path}: ${shifted.join(", ")}`).toBeLessThan(0.01);
    }
  });
}
