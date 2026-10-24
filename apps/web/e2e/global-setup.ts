import { chromium, type APIResponse, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { AUTH_FILE, SEED_FILE, type Seed } from "./fixtures";

// Seeds a realistic game night through the public API (via the Next.js app):
// a fresh group with 8 players, an open game with several rounds (a table wider
// than a phone), a closed game (archive + stats) and a live share link.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  // A browser context (not a bare request context): it accepts the Secure auth
  // cookies on http://localhost like a real browser does.
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const ctx = context.request;
  const stamp = Date.now();
  const leaderEmail = `e2e-leader-${stamp}@test.com`;
  const password = "password123";

  const ok = async (res: APIResponse, what: string) => {
    if (!res.ok()) throw new Error(`${what} failed: ${res.status()} ${await res.text()}`);
    return res;
  };

  const leader = await (
    await ok(
      await ctx.post("/api/auth/register", {
        data: { username: "Kovács Bálint", email: leaderEmail, password, password2: password },
      }),
      "register",
    )
  ).json();

  const names = ["Szabó Eszter", "Nagy Dominik", "Tóth Krisztina", "Horváth Levente", "Varga Zsófia", "Kiss Gergely", "Molnár Anna"];
  for (const [i, username] of names.entries()) {
    await ok(
      await ctx.post("/api/players", {
        data: { username, email: `e2e-p${i}-${stamp}@test.com`, password },
      }),
      `add player ${username}`,
    );
  }
  const players: { id: string; username: string }[] = await (await ctx.get("/api/players")).json();

  const createGame = async (name: string, winner_rule: "min" | "max") =>
    (await (await ok(await ctx.post("/api/games", { data: { name, winner_rule, icon: "🎲" } }), `create ${name}`)).json())
      .id as string;
  const addRound = async (gameId: string, round: number) =>
    ok(
      await ctx.post(`/api/games/${gameId}/scores`, {
        data: { scores: players.map((p, i) => ({ player_id: p.id, value: ((i + 3) * (round + 7)) % 23 })) },
      }),
      "add round",
    );

  // Uno (min): three finished matches via close → restart cycles. Match 1 has a tie
  // for first place and a player who skipped a round; the last one has 4 rounds.
  const closedGame = await createGame("Uno", "min");
  const roundOf = async (gameId: string, scores: [number, number][]) =>
    ok(
      await ctx.post(`/api/games/${gameId}/scores`, {
        data: { scores: scores.map(([i, value]) => ({ player_id: players[i].id, value })) },
      }),
      "add round",
    );
  await roundOf(closedGame, [[0, 3], [1, 3], [2, 9], [3, 7]]);
  await roundOf(closedGame, [[0, 2], [1, 2], [2, 8]]); // player 3 skipped round 2
  await ok(await ctx.post(`/api/games/${closedGame}/close`), "close game");
  await ok(await ctx.post(`/api/games/${closedGame}/restart`), "restart game");
  for (let r = 1; r <= 3; r++) await addRound(closedGame, r + 10);
  await ok(await ctx.post(`/api/games/${closedGame}/close`), "close game");
  await ok(await ctx.post(`/api/games/${closedGame}/restart`), "restart game");
  for (let r = 1; r <= 4; r++) await addRound(closedGame, r);
  await ok(await ctx.post(`/api/games/${closedGame}/close`), "close game");

  const openGame = await createGame("Skyjo", "max");
  for (let r = 1; r <= 6; r++) await addRound(openGame, r);

  const share = await (await ok(await ctx.post(`/api/games/${openGame}/share`), "share")).json();

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await context.storageState({ path: AUTH_FILE });
  const seed: Seed = {
    leaderEmail,
    password,
    leaderId: leader.user_id,
    playerId: players.find((p) => p.username === "Nagy Dominik")!.id,
    openGameId: openGame,
    openGameSlug: "skyjo",
    closedGameSlug: "uno",
    shareUrl: share.share_url,
  };
  fs.writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
  await browser.close();
}
