import { chromium } from "@playwright/test";
const TOKEN = "901b0b81dcfe46805c3aa958a3d00cf1fbed2cca3a17bcb55ec1a59c5e173070";
const BASE = "http://localhost:3100";
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies([{ name: "authjs.session-token", value: TOKEN, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();

await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
console.log("controller after 1st visit:", await page.evaluate(() => navigator.serviceWorker.controller ? "yes" : "NO"));

await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
console.log("controller after 2nd visit:", await page.evaluate(() => navigator.serviceWorker.controller ? "yes" : "NO"));
console.log("sw script url:", await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL));

await page.goto(BASE + "/library", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
console.log("caches:", await page.evaluate(async () => {
  const out = {};
  for (const n of await caches.keys()) out[n] = (await (await caches.open(n)).keys()).length;
  return out;
}));

// Does a navigation response look cacheable from the page's own view?
console.log("nav response:", await page.evaluate(async () => {
  const r = await fetch("/dashboard");
  return { ok: r.ok, redirected: r.redirected, type: r.type, url: r.url.replace(location.origin, "") };
}));
await browser.close();
