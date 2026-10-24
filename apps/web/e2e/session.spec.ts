import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { seed } from "./fixtures";

// Session lifetime end-to-end: the user must stay logged in after the 15-minute
// access token is gone, and logging out must really end the session.
// Every test logs in on its own (own refresh-token family), so token rotation in
// one test never affects another.

async function login(page: Page, target = "/dashboard") {
  await page.goto(target);
  await expect(page).toHaveURL(/\/login/);
  await page.locator("#email").fill(seed().leaderEmail);
  await page.locator("#password").fill(seed().password);
  await page.getByRole("button", { name: "Belépés" }).click();
  await page.waitForURL((url) => url.pathname === target);
}

async function cookie(context: BrowserContext, name: string) {
  return (await context.cookies()).find((c) => c.name === name);
}

test("login sets httpOnly session cookies and honours ?redirect=", async ({ page, context }) => {
  await login(page, "/stats");
  await expect(page.locator("table tbody tr")).toHaveCount(8);

  const access = await cookie(context, "hg_access_token");
  const refresh = await cookie(context, "hg_refresh_token");
  expect(access?.httpOnly).toBe(true);
  expect(refresh?.httpOnly).toBe(true);
  // the refresh cookie lives for weeks, not minutes
  expect(refresh!.expires * 1000 - Date.now()).toBeGreaterThan(20 * 24 * 3600 * 1000);
});

test("still logged in after the access token expired (navigation)", async ({ page, context }) => {
  await login(page);
  const refreshBefore = await cookie(context, "hg_refresh_token");

  // What the browser does after 15 minutes: the access cookie is gone.
  await context.clearCookies({ name: "hg_access_token" });

  await page.goto("/games");
  await expect(page).toHaveURL(/\/games$/);
  await expect(page.getByRole("link", { name: /Skyjo/ })).toBeVisible();

  // a new access token was issued and the refresh token was rotated
  expect((await cookie(context, "hg_access_token"))?.value).toBeTruthy();
  expect((await cookie(context, "hg_refresh_token"))?.value).not.toBe(refreshBefore?.value);
});

test("still logged in when the API rejects the access token (401 → refresh → retry)", async ({ page, context }) => {
  await login(page);

  // A token that looks fresh to the middleware but fails verification in the API,
  // like an expired session on a phone that slept with the page open.
  const fakePayload = Buffer.from(JSON.stringify({ sub: "x", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  await context.addCookies([{ name: "hg_access_token", value: `e30.${fakePayload}.bad-signature`, url: page.url() }]);

  await page.goto("/games");
  await expect(page.getByRole("link", { name: /Skyjo/ })).toBeVisible();
  await expect(page).toHaveURL(/\/games$/);
});

test("logout ends the session and revokes the refresh token", async ({ page, context }) => {
  await login(page);
  const oldRefresh = (await cookie(context, "hg_refresh_token"))!.value;

  await page.getByRole("button", { name: "Beállítások" }).click();
  const logout = page.getByRole("button", { name: /Kijelentkezés/ });
  await logout.scrollIntoViewIfNeeded();
  await logout.click();
  await page.waitForURL(/\/login/);

  expect(await cookie(context, "hg_access_token")).toBeUndefined();
  expect(await cookie(context, "hg_refresh_token")).toBeUndefined();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);

  // Replaying the old refresh token does not bring the session back.
  await context.addCookies([{ name: "hg_refresh_token", value: oldRefresh, url: page.url() }]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
