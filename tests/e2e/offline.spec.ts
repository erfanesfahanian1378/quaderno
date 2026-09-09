import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Offline, driven for real.
 *
 * PHASE-13 listed this file and never wrote it, and that is precisely why
 * offline shipped broken: the worker cached the sign-in page under
 * `/dashboard`, and returning a redirected response to a navigation fails the
 * load outright. Nothing caught it because nothing had ever cut the network.
 *
 * **This must run against a production build.** `next dev` serves CSS and
 * chunks from urls with changing `?v=` query strings, so nothing cache-first
 * ever hits and offline looks far worse than it is. The playwright config's
 * webServer builds and starts; do not point this at the dev server.
 *
 * The session cookie is named differently in production
 * (`__Secure-authjs.session-token`), which is itself a trap worth encoding —
 * setting the development name against a production build silently runs every
 * assertion signed out.
 */
/*
 * The PRODUCTION name. `sessionCookieName()` picks it by NODE_ENV, and this
 * suite always runs against `next start`. Using the development name here is
 * not a compile error and not a test failure — it just makes every request
 * anonymous, so the suite passes while asserting nothing. That happened.
 */
const SESSION_COOKIE = "__Secure-authjs.session-token";

async function signIn(context: BrowserContext, token: string): Promise<void> {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      // Chrome treats http://localhost as a trustworthy origin, so a Secure
      // cookie is accepted there.
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

/** The worker does not control the very first navigation of a session. */
async function waitForController(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    {
      timeout: 15_000,
    },
  );
}

async function cacheEntries(
  page: Page,
): Promise<
  { cache: string; url: string; redirected: boolean; cachedAt: string | null }[]
> {
  return page.evaluate(async () => {
    const out: {
      cache: string;
      url: string;
      redirected: boolean;
      cachedAt: string | null;
    }[] = [];

    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        out.push({
          cache: name,
          url: request.url.replace(location.origin, ""),
          redirected: Boolean(response?.redirected),
          cachedAt: response?.headers.get("x-quaderno-cached-at") ?? null,
        });
      }
    }
    return out;
  });
}

/**
 * Wait until the background warm has stored a route.
 *
 * The warm runs on idle after first paint, so there is no moment in the page
 * lifecycle to hook — polling the cache for the thing under test is the only
 * honest signal that it is there.
 */
async function waitForCachedPage(page: Page, path: string): Promise<void> {
  await page.waitForFunction(
    async (wanted) => {
      for (const name of await caches.keys()) {
        if (!name.startsWith("quaderno-pages-")) continue;
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (new URL(request.url).pathname === wanted) return true;
        }
      }
      return false;
    },
    path,
    { timeout: 30_000 },
  );
}

const TOKEN = process.env.E2E_SESSION_TOKEN ?? "";

test.describe("offline", () => {
  test.skip(
    !TOKEN,
    "E2E_SESSION_TOKEN is not set — see tests/e2e/README for how to mint one",
  );

  test("no cache entry is ever a redirected response", async ({
    context,
    page,
  }) => {
    await signIn(context, TOKEN);

    await page.goto("/dashboard");
    await waitForController(page);
    await page.goto("/library");
    await page.waitForTimeout(1500);

    /*
     * The assertion that would have caught the original bug. A redirected
     * response in the cache is unusable for a navigation, and the failure it
     * produces — ERR_FAILED — says nothing about why.
     */
    const redirected = (await cacheEntries(page)).filter(
      (entry) => entry.redirected,
    );
    expect(redirected, JSON.stringify(redirected)).toEqual([]);
  });

  test("ONLINE navigations never land on the offline page", async ({
    context,
    page,
  }) => {
    await signIn(context, TOKEN);

    await page.goto("/library");
    await waitForController(page);

    /*
     * The regression this exists for.
     *
     * Caching used to happen inside the same try as the fetch, so anything the
     * cache threw — a quota, a failed body read — was caught by the handler
     * that means "no network", and someone with a perfectly good connection
     * was shown "This page needs the network". It was reported from a phone
     * with full signal.
     *
     * Every navigation here is online. None may reach the fallback.
     */
    for (const path of ["/library", "/dashboard", "/review", "/schedule"]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(/offline\.html/);
      await expect(page.locator("h1")).not.toContainText("needs the network");
    }

    // And the pages really were cached, rather than caching being skipped to
    // make the assertion above pass.
    const pages = (await cacheEntries(page)).filter((entry) =>
      entry.cache.includes("pages"),
    );
    expect(pages.length).toBeGreaterThan(0);
  });

  test("a visited page renders offline and says how stale it is", async ({
    context,
    page,
  }) => {
    await signIn(context, TOKEN);

    await page.goto("/library");
    await waitForController(page);
    // Twice: the first navigation of a session is not yet controlled, so
    // nothing about it reaches the worker's fetch handler.
    await page.goto("/library");
    await page.waitForTimeout(1500);

    await context.setOffline(true);
    await page.goto("/library");

    await expect(page.locator("h1")).toHaveText("Library");
    await expect(page.getByRole("status")).toContainText(
      /showing this page as it was at/i,
    );
  });

  /*
   * The test that this whole phase exists for.
   *
   * It used to assert the opposite — that a page you had not visited fell back
   * to the offline stub — and passing it was the bug. Being told "this page
   * needs the network" for a page the server could have sent an hour earlier,
   * over wifi, for nothing, is not offline support. The warm pass is what
   * changed the answer.
   */
  test("a page never visited still renders offline", async ({
    context,
    page,
  }) => {
    await signIn(context, TOKEN);

    await page.goto("/dashboard");
    await waitForController(page);
    await page.goto("/dashboard");

    // Warmed in the background, not by visiting it.
    await waitForCachedPage(page, "/stats");

    await context.setOffline(true);
    await page.goto("/stats");

    await expect(page).not.toHaveURL(/offline\.html/);
    await expect(
      page.getByRole("heading", { name: /stats/i }).first(),
    ).toBeVisible();
  });

  test("every main route renders offline after warming", async ({
    context,
    page,
  }) => {
    await signIn(context, TOKEN);

    await page.goto("/dashboard");
    await waitForController(page);
    await page.goto("/dashboard");

    for (const route of ["/review", "/schedule", "/search", "/settings"]) {
      await waitForCachedPage(page, route);
    }

    await context.setOffline(true);

    for (const route of ["/review", "/schedule", "/search", "/settings"]) {
      await page.goto(route);
      // The route itself, not a redirect to the stub.
      expect(new URL(page.url()).pathname, `${route} fell back`).toBe(route);
      // And it rendered: the app frame is present, not a blank chunk failure.
      await expect(page.locator("main").first()).toBeVisible();
    }
  });

  /**
   * Moving between pages WITHOUT a reload.
   *
   * Next fetches a flight payload rather than a document for an in-app link.
   * Those requests are a separate cache path and were previously not handled
   * at all, so every offline navigation depended on Next noticing the failure
   * and falling back to a full load.
   */
  test("in-app links work offline", async ({ context, page }) => {
    await signIn(context, TOKEN);

    await page.goto("/dashboard");
    await waitForController(page);
    await page.goto("/dashboard");
    await waitForCachedPage(page, "/schedule");

    await context.setOffline(true);

    const link = page.getByRole("link", { name: /schedule/i }).first();
    await link.click();

    await page.waitForURL(/\/schedule/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/offline\.html/);
  });

  test("the fallback still catches a route nothing knows about", async ({
    context,
    page,
  }) => {
    await signIn(context, TOKEN);

    await page.goto("/library");
    await waitForController(page);
    await page.goto("/library");
    await page.waitForTimeout(1500);

    await context.setOffline(true);
    // A document that was never opened and never kept. Its page is dynamic and
    // its bytes are hundreds of megabytes; guessing is not an option.
    await page.goto("/d/never-existed-at-all");

    await expect(page.getByText("Still available")).toBeVisible();
    await expect(page.getByRole("link", { name: /Library/ })).toBeVisible();
  });

  test("upload refuses offline rather than failing on click", async ({
    context,
    page,
  }) => {
    await signIn(context, TOKEN);

    await page.goto("/library");
    await waitForController(page);
    await page.goto("/library");
    await page.waitForTimeout(1500);

    await context.setOffline(true);
    await page.goto("/library");

    // An upload needs a presigned url, which needs the server. Saying so beats
    // accepting a file that will never go anywhere.
    await expect(page.getByText("Uploading needs a connection")).toBeVisible();
  });

  test("a note written offline survives a reload and is still queued", async ({
    context,
    page,
  }) => {
    await signIn(context, TOKEN);

    await page.goto("/settings");
    await waitForController(page);
    await page.waitForTimeout(800);

    // Queue a write directly: driving the editor needs a document fixture,
    // and what is being tested here is durability, not the editor.
    await context.setOffline(true);
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("quaderno-outbox", 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction("writes", "readwrite");
        tx.objectStore("writes").put({
          id: "e2e-offline-write",
          method: "PUT",
          path: "/api/note-pages/does-not-exist",
          body: { content: "written offline" },
          stream: "note-page:e2e",
          label: "Note page",
          queuedAt: Date.now(),
          attempts: 0,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });

    await page.reload();
    await page.waitForTimeout(1200);

    // Still there after a reload while still offline — the point of a durable
    // queue rather than component state.
    const survived = await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("quaderno-outbox", 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      return new Promise<number>((resolve) => {
        const tx = database.transaction("writes", "readonly");
        const count = tx.objectStore("writes").count();
        count.onsuccess = () => resolve(count.result);
      });
    });

    expect(survived).toBeGreaterThan(0);
  });
});
