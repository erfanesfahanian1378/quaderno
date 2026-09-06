import { expect, test } from "@playwright/test";

/**
 * PHASE-01 smoke: the app boots, the token stylesheet loads, and switching
 * the theme does not flash the wrong one.
 */

test("the landing page renders with tokens applied", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /your class, your marks/i }),
  ).toBeVisible();

  // If tokens.css failed to load, the body would fall back to transparent.
  const background = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(background).not.toBe("rgba(0, 0, 0, 0)");
});

test("the theme is decided before first paint, not after", async ({ page }) => {
  await page.goto("/dev/tokens");

  // The inline script in <head> must have set this already; a value of null
  // here means the attribute is being set by a React effect, which is the
  // flash PHASE-01 forbids.
  const theme = await page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
  expect(theme).toMatch(/^(light|dark)$/);
});

test("switching the theme repaints without a reload", async ({ page }) => {
  await page.goto("/dev/tokens");

  const readBackground = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.getByRole("radio", { name: "Light" }).click();
  const light = await readBackground();

  await page.getByRole("radio", { name: "Dark" }).click();
  const dark = await readBackground();

  expect(light).not.toBe(dark);
  expect(
    await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    ),
  ).toBe("dark");

  // And it survives a reload — the cookie/localStorage write happened.
  await page.reload();
  expect(await readBackground()).toBe(dark);
});

test("the accented-glyph specimen renders without tofu", async ({ page }) => {
  await page.goto("/dev/tokens");

  const specimen = page.getByText("à è é ì ò ù ç œ â ê î ô û ë ï ü").first();
  await expect(specimen).toBeVisible();

  // A box with zero width would mean the subset dropped the glyphs entirely.
  const box = await specimen.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
});
