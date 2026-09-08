import { chromium } from "@playwright/test";
const TOKEN = "901b0b81dcfe46805c3aa958a3d00cf1fbed2cca3a17bcb55ec1a59c5e173070";
const browser = await chromium.launch();
const context = await browser.newContext();
// Production names it __Secure- and requires the Secure attribute; Chrome
// permits Secure cookies on http://localhost as a trustworthy origin.
await context.addCookies([{
  name: "__Secure-authjs.session-token",
  value: TOKEN,
  domain: "localhost",
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
}]);
const page = await context.newPage();
const res = await page.goto("http://localhost:3100/dashboard", { waitUntil: "domcontentloaded" });
console.log("status:", res.status(), "landed on:", page.url().replace("http://localhost:3100", ""));
await page.waitForTimeout(1500);
console.log("h1:", await page.locator("h1").first().innerText().catch(() => "none"));
console.log("cookies seen:", (await context.cookies()).map((c) => c.name).join(", "));
await browser.close();
