import { expect, test, type Page } from "@playwright/test";
import { AUTH_FILE } from "./fixtures";

// The scoring rules as a player sees them on the game screen: a skipped round is not
// 0 points, ties show every leader, a missing score can be filled in later, and the
// last round can be undone. Each test run uses its own fresh game.
test.use({ storageState: AUTH_FILE });

async function newGame(page: Page, rule: "min" | "max", testName: string) {
  const name = `E2E ${testName} ${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const res = await page.request.post("/api/games", { data: { name, winner_rule: rule, icon: "🎲" } });
  expect(res.ok()).toBeTruthy();
  await page.goto(`/games/${encodeURIComponent(name.toLowerCase())}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  return name;
}

const input = (page: Page, player: string) => page.getByRole("spinbutton", { name: `${player} pontja` });

test("skipped round, tie, fill-in and undo on the game screen", async ({ page }, testInfo) => {
  await newGame(page, "min", testInfo.project.name);
  const leader = page.getByTestId("leader-line");

  // Round 1: Anna and Dominik tie, everyone else skips.
  await input(page, "Molnár Anna").fill("5");
  await input(page, "Nagy Dominik").fill("5");
  await page.getByRole("button", { name: "Kör mentése" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("nem kap pontot");
  await expect(dialog).toContainText("Ez nem 0 pont");
  await dialog.getByRole("button", { name: "Mentés így" }).click();

  await expect(leader).toContainText("Holtverseny: Molnár Anna és Nagy Dominik (5 pont)");

  // Fill in the missing score of Kiss Gergely for round 1: 3 points leads a min game.
  await page.getByRole("button", { name: "Kiss Gergely, 1. kör: hiányzik — pótlás" }).click();
  const edit = page.getByRole("spinbutton", { name: "Kiss Gergely, 1. kör" });
  await edit.fill("3");
  await edit.press("Enter");
  await expect(leader).toContainText("Vezet: Kiss Gergely (3 pont)");

  // Round 2 without Kiss Gergely: he drops behind even though his total stays lowest.
  await input(page, "Molnár Anna").fill("4");
  await input(page, "Nagy Dominik").fill("6");
  await page.getByRole("button", { name: "Kör mentése" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mentés így" }).click();
  await expect(leader).toContainText("Vezet: Molnár Anna (9 pont)");
  await expect(page.getByText("3. hely · 1/2 kör")).toBeVisible(); // total row of Kiss Gergely

  // Undo the last round: back to Kiss Gergely leading.
  await page.getByRole("button", { name: "Utolsó kör" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Törlés" }).click();
  await expect(leader).toContainText("Vezet: Kiss Gergely (3 pont)");
  await expect(page.getByText("Következik: 2. kör")).toBeVisible();
});

test("Enter moves to the next player's input", async ({ page }, testInfo) => {
  await newGame(page, "max", `enter ${testInfo.project.name}`);
  const first = page.locator("input[id^=inp_]").first();
  await first.fill("7");
  await first.press("Enter");
  await expect(page.locator("input[id^=inp_]").nth(1)).toBeFocused();
});

test("typed scores are kept as drafts across a reload and only count when saved", async ({ page }, testInfo) => {
  await newGame(page, "max", `draft ${testInfo.project.name}`);
  const leader = page.getByTestId("leader-line");

  await input(page, "Molnár Anna").fill("12");
  await input(page, "Nagy Dominik").fill("-3");
  await expect(page.getByTestId("draft-status")).toHaveText("Vázlat mentve ✓");

  // reload (or another device of the leader): the numbers are still there…
  await page.reload();
  await expect(input(page, "Molnár Anna")).toHaveValue("12");
  await expect(input(page, "Nagy Dominik")).toHaveValue("-3");
  // …but they are not scores yet
  await expect(leader).toHaveText("Még nincs pont rögzítve");
  await expect(page.getByTestId("standings")).toHaveCount(0);

  await page.getByRole("button", { name: "Kör mentése" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mentés így" }).click();
  await expect(leader).toContainText("Vezet: Molnár Anna (12 pont)");
  await expect(input(page, "Molnár Anna")).toHaveValue("");

  // the draft was cleared on submit: a reload shows an empty input row
  await page.reload();
  await expect(input(page, "Molnár Anna")).toHaveValue("");
  await expect(leader).toContainText("Vezet: Molnár Anna (12 pont)");
});

test("live standings show rank, total, gap and rounds — here and in the shared viewer", async ({ page }, testInfo) => {
  await newGame(page, "min", `standings ${testInfo.project.name}`);
  const fill = async (values: [string, string][]) => {
    for (const [name, v] of values) await input(page, name).fill(v);
    await page.getByRole("button", { name: "Kör mentése" }).click();
    const partial = page.getByRole("dialog").getByRole("button", { name: "Mentés így" });
    if (await partial.isVisible().catch(() => false)) await partial.click();
  };
  await fill([["Molnár Anna", "4"], ["Nagy Dominik", "4"], ["Kiss Gergely", "9"]]);
  await expect(page.getByTestId("standings-row")).toHaveCount(3);
  await fill([["Molnár Anna", "1"], ["Nagy Dominik", "3"]]);

  const rows = page.getByTestId("standings-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Molnár Anna");
  await expect(rows.nth(0)).toContainText("Vezet · 2 kör");
  await expect(rows.nth(0)).toContainText("5");
  await expect(rows.nth(1)).toContainText("Nagy Dominik");
  await expect(rows.nth(1)).toContainText("2 ponttal lemaradva");
  await expect(rows.nth(2)).toContainText("Kiss Gergely");
  await expect(rows.nth(2)).toContainText("1 körrel kevesebb · 1/2 kör");

  // share and open the viewer
  const share = await page.request.post(`/api/games/${await gameIdFromPage(page)}/share`);
  const { share_url } = (await share.json()) as { share_url: string };
  await page.goto(share_url);
  const live = page.getByTestId("standings-row");
  await expect(live).toHaveCount(3);
  await expect(live.nth(0)).toContainText("Molnár Anna");
  await expect(live.nth(2)).toContainText("1 körrel kevesebb");
});

async function gameIdFromPage(page: Page) {
  const heading = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";
  const games = (await (await page.request.get("/api/games")).json()) as { id: string; name: string }[];
  return games.find((g) => heading.includes(g.name))!.id;
}
