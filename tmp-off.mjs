import { chromium } from "@playwright/test";
const TOKEN = "901b0b81dcfe46805c3aa958a3d00cf1fbed2cca3a17bcb55ec1a59c5e173070";
const BASE = "http://localhost:3100";
const OUT = process.argv[2];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
// Production names the cookie __Secure- and requires Secure; Chrome allows
// that on http://localhost because localhost is a trustworthy origin.
await context.addCookies([{ name: "__Secure-authjs.session-token", value: TOKEN, domain: "localhost", path: "/", httpOnly: true, secure: true, sameSite: "Lax" }]);
const page = await context.newPage();

// Online: visit the routes so they get cached.
for (const path of ["/dashboard", "/library", "/review", "/schedule", "/dashboard"]) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);
}
await page.waitForTimeout(2000);

console.log("cached pages:", await page.evaluate(async () => {
  const names = await caches.keys();
  const out = {};
  for (const n of names) {
    const c = await caches.open(n);
    out[n] = (await c.keys()).map((r) => r.url.replace(location.origin, "")).filter((u) => !u.includes("_next")).slice(0, 8);
  }
  return out;
}));
console.log("any redirected entry?", await page.evaluate(async () => {
  const names = await caches.keys();
  const bad = [];
  for (const n of names) {
    const c = await caches.open(n);
    for (const r of await c.keys()) {
      const res = await c.match(r);
      if (res?.redirected) bad.push(r.url.replace(location.origin, ""));
    }
  }
  return bad;
}));

await context.setOffline(true);
console.log("\n--- offline ---");
for (const [label, path] of [["dashboard", "/dashboard"], ["library", "/library"], ["review", "/review"], ["schedule", "/schedule"], ["stats (never visited)", "/stats"], ["settings (not cached)", "/settings"]]) {
  const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded" }).catch(() => null);
  await page.waitForTimeout(900);
  const h1 = await page.locator("h1").first().innerText().catch(() => "—");
  const strip = await page.locator('[role="status"]').first().innerText().catch(() => "");
  console.log(`${label.padEnd(22)} ${res ? "loaded" : "ERR_FAILED"}  h1="${h1.trim().slice(0,28)}"  ${strip.replace(/\s+/g," ").trim().slice(0,60)}`);
}
await page.screenshot({ path: `${OUT}/off-dash.png` });
await browser.close();
