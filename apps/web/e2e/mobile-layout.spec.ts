import { expect, test, type Page } from "@playwright/test";
import { AUTH_FILE, seed } from "./fixtures";
import {
  expectNoHorizontalOverflow,
  expectNoZoomInputs,
  expectNothingUnderFixedNav,
  expectTablesScrollable,
  expectTapTargets,
  expectVerticalScroll,
  isTouchProject,
} from "./layout-checks";

// Runs in every viewport project (360×740, 390×844, 768×1024, 1280×800).
// Fails if any page scrolls sideways, a table cannot be scrolled inside its own
// container, a tap target is too small, an input would make iOS zoom, or
// content ends up under the fixed navigation.

type PageCase = {
  name: string;
  path: () => string;
  /** something that only renders once the page's data has loaded */
  ready: (page: Page) => Promise<void>;
  /** minimum number of tables expected on the page */
  tables?: number;
};

const s = () => seed();

const appPages: PageCase[] = [
  {
    name: "dashboard",
    path: () => "/dashboard",
    ready: async (page) => {
      await expect(page.locator("table tbody tr")).toHaveCount(8);
    },
    tables: 1,
  },
  {
    name: "games list",
    path: () => "/games",
    ready: async (page) => {
      await expect(page.getByRole("link", { name: /Skyjo/ })).toBeVisible();
    },
  },
  {
    name: "open game (score entry)",
    path: () => `/games/${s().openGameSlug}`,
    ready: async (page) => {
      await expect(page.locator("table tbody tr")).toHaveCount(1 + 1 + 6); // total + input + 6 rounds
    },
    tables: 1,
  },
  {
    name: "closed game (archive)",
    path: () => `/games/${s().closedGameSlug}`,
    ready: async (page) => {
      await expect(page.locator("table tbody tr")).toHaveCount(1 + 4);
    },
    tables: 1,
  },
  {
    name: "new game",
    path: () => "/games/new",
    ready: async (page) => {
      await expect(page.locator("#gameName")).toBeVisible();
    },
  },
  {
    name: "stats",
    path: () => "/stats",
    ready: async (page) => {
      await expect(page.locator("table tbody tr")).toHaveCount(8);
    },
    tables: 1,
  },
  {
    name: "player",
    path: () => `/players/${s().playerId}`,
    ready: async (page) => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nagy Dominik");
    },
  },
  {
    name: "new player",
    path: () => "/players/new",
    ready: async (page) => {
      await expect(page.locator("#password2")).toBeVisible();
    },
  },
  {
    name: "settings",
    path: () => "/settings",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Beállítások" })).toBeVisible();
    },
  },
];

const publicPages: PageCase[] = [
  {
    name: "login",
    path: () => "/login",
    ready: async (page) => {
      await expect(page.locator("#password")).toBeVisible();
    },
  },
  {
    name: "register",
    path: () => "/register",
    ready: async (page) => {
      await expect(page.locator("#password2")).toBeVisible();
    },
  },
  {
    name: "live viewer",
    path: () => s().shareUrl,
    ready: async (page) => {
      await expect(page.locator("table tbody tr")).toHaveCount(1 + 6);
      await expect(page.getByRole("status")).toContainText("Élő");
    },
    tables: 1,
  },
];

async function runChecks(page: Page, touch: boolean, c: PageCase) {
  await page.goto(c.path());
  await c.ready(page);
  await page.evaluate(() => document.fonts.ready);

  await expectNoHorizontalOverflow(page);
  await expectVerticalScroll(page);
  if (c.tables) expect(await page.locator("table").count()).toBeGreaterThanOrEqual(c.tables);
  const overflowing = await expectTablesScrollable(page, { touch });
  await expectNothingUnderFixedNav(page);
  if (touch) {
    await expectTapTargets(page);
    await expectNoZoomInputs(page);
  }
  return overflowing;
}

test.describe("logged-in pages", () => {
  test.use({ storageState: AUTH_FILE });

  for (const c of appPages) {
    test(`${c.name} fits the screen`, async ({ page }, testInfo) => {
      await runChecks(page, isTouchProject(testInfo), c);
    });
  }

  test("score table is wider than a phone and scrolls with a swipe", async ({ page }, testInfo) => {
    test.skip((testInfo.project.use.viewport?.width ?? 0) > 640, "phones only");
    const overflowing = await runChecks(page, true, appPages.find((c) => c.name.startsWith("open game"))!);
    // 8 players do not fit on a phone: make sure the swipe check really ran.
    expect(overflowing).toBe(1);
  });

  test("settings sidebar scrolls to the logout button", async ({ page }, testInfo) => {
    await page.goto(`/games/${s().openGameSlug}`);
    await appPages[2].ready(page);
    await page.getByRole("button", { name: "Beállítások" }).click();
    await expect(page.getByText("Megosztva")).toBeVisible();
    const logout = page.getByRole("button", { name: /Kijelentkezés/ });
    await logout.scrollIntoViewIfNeeded();
    await expect(logout).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalOverflow(page);
    if (isTouchProject(testInfo)) await expectTapTargets(page, "[class*=settings-panel]");
  });

  test("close-game confirmation fits and is tappable", async ({ page }, testInfo) => {
    await page.goto(`/games/${s().openGameSlug}`);
    await appPages[2].ready(page);
    await page.getByRole("button", { name: "Meccs lezárása" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalOverflow(page);
    if (isTouchProject(testInfo)) await expectTapTargets(page, "[role=dialog]");
    await dialog.getByRole("button", { name: "Mégse" }).click();
    await expect(dialog).toBeHidden();
  });

  test("account modal fits and its save button is reachable", async ({ page }, testInfo) => {
    await page.goto(`/players/${s().playerId}`);
    await appPages[6].ready(page);
    await page.getByRole("button", { name: "Fiók szerkesztése" }).click();
    const save = page.getByRole("button", { name: "Mentés" });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalOverflow(page);
    if (isTouchProject(testInfo)) {
      await expectTapTargets(page, "[class*=modal-panel]");
      await expectNoZoomInputs(page);
    }
  });

  test("icon picker fits and is tappable", async ({ page }, testInfo) => {
    await page.goto("/games/new");
    await page.getByRole("button", { name: /Válassz ikont/ }).click();
    const select = page.getByRole("button", { name: /Kiválaszt/ });
    await expect(page.getByRole("heading", { name: "Válassz ikont" })).toBeInViewport();
    await select.scrollIntoViewIfNeeded();
    await expect(select).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    if (isTouchProject(testInfo)) {
      await expectTapTargets(page, "[class*=popup]");
      await expectNoZoomInputs(page);
    }
  });

  test("a round can be entered on this screen", async ({ page }) => {
    await page.goto(`/games/${s().openGameSlug}`);
    await appPages[2].ready(page);
    const inputs = page.locator("input[id^=inp_]");
    await expect(inputs).toHaveCount(8);
    // the last player's input sits off-screen on a phone: it must be reachable
    const last = inputs.last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await last.fill("5");
    await expect(last).toHaveValue("5");
    await last.fill("");
  });
});

test.describe("public pages", () => {
  for (const c of publicPages) {
    test(`${c.name} fits the screen`, async ({ page }, testInfo) => {
      await runChecks(page, isTouchProject(testInfo), c);
    });
  }
});
