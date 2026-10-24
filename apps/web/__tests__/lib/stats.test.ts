import { describe, expect, it } from "vitest";
import { availableYears, groupMatches, outcome, type Placement, type WinnerRule } from "@/lib/stats/matches";
import { buildLeaderboard, computePlayerStats, mostActive, rankingThreshold } from "@/lib/stats/players";
import { headToHead, rivalries } from "@/lib/stats/rivals";
import { bestGame, gameStats, personalBests } from "@/lib/stats/games";
import { daysAgoLabel, localDate, localMonthKey, localYear, monthWindow } from "@/lib/stats/time";

// ── tiny builder: match("id", "2025-03-01T18:00:00Z", [["anna", 1, 12], ["bela", 2, 20]]) ──
let gameOf: Record<string, string> = {};
function match(
  id: string,
  playedAt: string,
  results: [user: string, place: number, total: number, rounds?: number, best?: number | null][],
  opts: { game?: string; rule?: WinnerRule } = {},
): Placement[] {
  const game = opts.game ?? "skyjo";
  gameOf[id] = game;
  return results.map(([user_id, place, total_score, rounds_played = 3, best_round = null]) => ({
    snapshot_id: id,
    game_id: game,
    user_id,
    place,
    total_score,
    rounds_played,
    best_round,
    winner_rule: opts.rule ?? "min",
    played_at: playedAt,
  }));
}

const players = ["anna", "bela", "cili", "dani"].map((id) => ({ id, username: id[0].toUpperCase() + id.slice(1) }));
const games = [
  { id: "skyjo", name: "Skyjo", icon: "🃏", winner_rule: "min" as const },
  { id: "uno", name: "Uno", icon: "🎴", winner_rule: "max" as const },
  { id: "unplayed", name: "Never", icon: "❔", winner_rule: "max" as const },
];

describe("Budapest calendar", () => {
  it("assigns New Year's Eve matches to the right year", () => {
    expect(localYear("2024-12-31T22:30:00Z")).toBe(2024); // 23:30 in Budapest
    expect(localYear("2024-12-31T23:30:00Z")).toBe(2025); // 00:30 on 1 January
    expect(localYear("2025-12-31T22:59:59Z")).toBe(2025);
    expect(localYear("2025-12-31T23:00:00Z")).toBe(2026);
  });

  it("respects summer time for month boundaries", () => {
    expect(localMonthKey("2025-06-30T21:59:00Z")).toBe("2025-06"); // 23:59 CEST
    expect(localMonthKey("2025-06-30T22:00:00Z")).toBe("2025-07"); // 00:00 CEST
    expect(localDate("2025-03-30T01:30:00Z")).toEqual({ year: 2025, month: 3, day: 30 });
  });

  it("counts days on the local calendar", () => {
    const now = new Date("2025-05-10T08:00:00Z");
    expect(daysAgoLabel("2025-05-10T06:00:00Z", now)).toBe("ma");
    expect(daysAgoLabel("2025-05-07T10:00:00Z", now)).toBe("3 napja");
    expect(daysAgoLabel(null, now)).toBe("nincs adat");
  });

  it("builds month windows", () => {
    expect(monthWindow(2025).map((m) => m.key)[0]).toBe("2025-01");
    const rolling = monthWindow(null, new Date("2025-02-15T12:00:00Z"));
    expect(rolling).toHaveLength(12);
    expect(rolling[0].key).toBe("2024-03");
    expect(rolling[11].key).toBe("2025-02");
  });
});

describe("days ago across local midnight", () => {
  it("21:30Z on 9 May is still 9 May in Budapest (CEST, UTC+2)", () => {
    expect(localDate("2025-05-09T21:30:00Z").day).toBe(9);
    expect(daysAgoLabel("2025-05-09T21:30:00Z", new Date("2025-05-10T08:00:00Z"))).toBe("tegnap");
  });
});

describe("matches", () => {
  const rows = [
    ...match("m1", "2024-12-31T22:30:00Z", [["anna", 1, 10], ["bela", 2, 20]]),
    ...match("m2", "2024-12-31T23:30:00Z", [["anna", 2, 15], ["bela", 1, 9]]),
  ];

  it("filters by Budapest year", () => {
    expect(groupMatches(rows, 2024).map((m) => m.id)).toEqual(["m1"]);
    expect(groupMatches(rows, 2025).map((m) => m.id)).toEqual(["m2"]);
    expect(groupMatches(rows).map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(availableYears(rows)).toEqual([2025, 2024]);
  });

  it("classifies outcomes with ties", () => {
    const [m] = groupMatches(match("t", "2025-01-01T12:00:00Z", [["a", 1, 5], ["b", 1, 5], ["c", 3, 9], ["d", 3, 9]]));
    expect(m.results.map((r) => outcome(m, r))).toEqual(["W", "W", "L", "L"]);
    const [all] = groupMatches(match("u", "2025-01-01T12:00:00Z", [["a", 1, 5], ["b", 1, 5]]));
    expect(all.results.map((r) => outcome(all, r))).toEqual(["W", "W"]); // everyone tied: nobody loses
    const [three] = groupMatches(match("v", "2025-01-01T12:00:00Z", [["a", 1, 1], ["b", 2, 2], ["c", 3, 3]]));
    expect(three.results.map((r) => outcome(three, r))).toEqual(["W", "D", "L"]);
  });
});

describe("leaderboard and sample size", () => {
  // Anna: 1 win in 2 matches. Bela: 6 wins in 12 2-player matches vs Cili.
  const rows: Placement[] = [];
  rows.push(...match("a1", "2025-01-01T12:00:00Z", [["anna", 1, 1], ["dani", 2, 2]]));
  rows.push(...match("a2", "2025-01-02T12:00:00Z", [["anna", 2, 2], ["dani", 1, 1]]));
  for (let i = 0; i < 12; i++) {
    const bWins = i % 2 === 0;
    rows.push(
      ...match(`b${i}`, `2025-02-${String(i + 1).padStart(2, "0")}T12:00:00Z`, [
        ["bela", bWins ? 1 : 2, 1],
        ["cili", bWins ? 2 : 1, 2],
      ]),
    );
  }
  const matches = groupMatches(rows);

  it("does not rank players below the threshold", () => {
    const board = buildLeaderboard(matches, players);
    expect(board.minMatches).toBe(5);
    expect(board.ranked.map((s) => s.id)).toEqual(["bela", "cili"]);
    expect(board.unranked.map((s) => [s.id, s.matches, s.winRate])).toEqual([
      ["anna", 2, 50],
      ["dani", 2, 50],
    ]);
  });

  it("lowers the threshold while nobody has 5 matches", () => {
    const early = groupMatches(rows.filter((r) => r.snapshot_id.startsWith("a")));
    const board = buildLeaderboard(early, players);
    expect(board.minMatches).toBe(2);
    expect(board.ranked.map((s) => s.id).sort()).toEqual(["anna", "dani"]);
    expect(rankingThreshold([])).toBe(1);
  });

  it("starts each player at their expected win rate (1 / players per match)", () => {
    // Eve: 3 of 5 in 4-player matches (expected 25%); Bela: 6 of 12 in 2-player matches (expected 50%)
    const extra: Placement[] = [];
    for (let i = 0; i < 5; i++) {
      extra.push(
        ...match(`e${i}`, `2025-03-0${i + 1}T12:00:00Z`, [
          ["eve", i < 3 ? 1 : 2, 1],
          ["x1", i < 3 ? 2 : 1, 2],
          ["x2", 3, 3],
          ["x3", 4, 4],
        ]),
      );
    }
    const everyone = [...players, { id: "eve", username: "Eve" }];
    const board = buildLeaderboard(groupMatches([...rows, ...extra]), everyone);
    const eve = board.ranked.find((s) => s.id === "eve")!;
    const bela = board.ranked.find((s) => s.id === "bela")!;
    expect(eve.winRate).toBe(60);
    expect(bela.winRate).toBe(50);
    expect(eve.adjustedRate).toBeCloseTo((3 + 4 * 0.25) / 9);
    expect(bela.adjustedRate).toBeCloseTo((6 + 4 * 0.5) / 16);
    // Eve's 60% over only 5 matches is pulled towards her 25% expectation, so Bela stays ahead.
    expect(board.ranked.map((s) => s.id)).toEqual(["bela", "cili", "eve"]); // Bela and Cili tie (6/12): by name
  });

  it("a short lucky run does not top a long solid record", () => {
    const lucky: Placement[] = [];
    for (let i = 0; i < 5; i++) lucky.push(...match(`l${i}`, `2025-04-0${i + 1}T12:00:00Z`, [["dani", i < 3 ? 1 : 2, 1], ["anna", i < 3 ? 2 : 1, 2]]));
    // Bela 16/20 (80%) in 2-player matches vs Dani 3/5 (60%) — and Dani with 5/5 would still need the prior
    const solid: Placement[] = [];
    for (let i = 0; i < 20; i++) solid.push(...match(`s${i}`, `2025-05-${String(i + 1).padStart(2, "0")}T12:00:00Z`, [["bela", i < 16 ? 1 : 2, 1], ["cili", i < 16 ? 2 : 1, 2]]));
    const board = buildLeaderboard(groupMatches([...lucky, ...solid]), players);
    expect(board.ranked[0].id).toBe("bela");
  });

  it("tracks streaks, form and trend", () => {
    const stream = groupMatches([
      ...match("s1", "2025-01-01T12:00:00Z", [["anna", 1, 1], ["bela", 2, 2]]),
      ...match("s2", "2025-01-02T12:00:00Z", [["anna", 1, 1], ["bela", 2, 2]]),
      ...match("s3", "2025-01-03T12:00:00Z", [["anna", 2, 2], ["bela", 1, 1]]),
      ...match("s4", "2025-01-04T12:00:00Z", [["anna", 1, 1], ["bela", 1, 1]]),
      ...match("s5", "2025-01-05T12:00:00Z", [["anna", 2, 2], ["bela", 1, 1], ["cili", 3, 3]]),
    ]);
    const anna = computePlayerStats(stream, players[0]);
    expect(anna.bestWinStreak).toBe(2);
    expect(anna.currentWinStreak).toBe(0);
    expect(anna.form).toEqual(["W", "W", "L", "W", "D"]);
    expect(anna.trend).toEqual([1, 1, 2, 1, 2]);
    expect(anna.wins).toBe(3);
    expect(anna.losses).toBe(1);
    const bela = computePlayerStats(stream, players[1]);
    expect(bela.currentWinStreak).toBe(3);
    expect(bela.lastPlayedAt).toBe("2025-01-05T12:00:00Z");
  });

  it("lists everyone tied for most active", () => {
    const board = buildLeaderboard(matches, players);
    expect(mostActive([...board.ranked, ...board.unranked]).map((s) => s.id)).toEqual(["bela", "cili"]);
    expect(mostActive([])).toEqual([]);
  });
});

describe("head to head", () => {
  const matches = groupMatches([
    ...match("h1", "2025-01-01T12:00:00Z", [["anna", 1, 1], ["bela", 2, 2], ["cili", 3, 3]]),
    ...match("h2", "2025-01-02T12:00:00Z", [["anna", 2, 2], ["bela", 1, 1]]),
    ...match("h3", "2025-01-03T12:00:00Z", [["anna", 1, 1], ["bela", 1, 1]]),
    ...match("h4", "2025-01-04T12:00:00Z", [["bela", 1, 1], ["cili", 2, 2]]),
  ]);

  it("counts wins, draws and losses per opponent", () => {
    expect(headToHead(matches, "anna", players)).toEqual([
      { opponentId: "bela", opponent: "Bela", played: 3, wins: 1, draws: 1, losses: 1, score: 50 },
      { opponentId: "cili", opponent: "Cili", played: 1, wins: 1, draws: 0, losses: 0, score: 100 },
    ]);
  });

  it("lists rivalries, most played first", () => {
    const r = rivalries(matches, players);
    expect(r.map((x) => [x.a.id, x.b.id, x.played, x.aWins, x.bWins, x.draws])).toEqual([
      ["anna", "bela", 3, 1, 1, 1],
      ["bela", "cili", 2, 2, 0, 0],
      ["anna", "cili", 1, 1, 0, 0],
    ]);
    expect(rivalries(matches, players, 2)).toHaveLength(2);
  });
});

describe("game records and personal bests", () => {
  gameOf = {};
  const rows = [
    // Skyjo (min): best total is the LOWEST; dani's 3 from 1 of 3 rounds is not a record
    ...match("g1", "2025-01-01T12:00:00Z", [["anna", 1, 12, 3, -3], ["bela", 2, 30, 3, 2], ["dani", 3, 3, 1, 3]]),
    ...match("g2", "2025-02-01T12:00:00Z", [["bela", 1, 12, 3, -5], ["anna", 2, 14, 3, -5]]),
    // Uno (max): best total is the HIGHEST
    ...match("u1", "2025-03-01T12:00:00Z", [["cili", 1, 500, 4, 200], ["anna", 2, 300, 4, 150]], { game: "uno", rule: "max" }),
    // legacy match without round data (rounds 0): totals still count
    ...match("u2", "2023-03-01T12:00:00Z", [["anna", 1, 650, 0, null], ["cili", 2, 100, 0, null]], { game: "uno", rule: "max" }),
  ];
  const matches = groupMatches(rows);

  it("finds records by each game's rule, with tied holders", () => {
    const stats = gameStats(matches, games, players);
    expect(stats.map((g) => g.gameId)).toEqual(["uno", "skyjo"]); // never-played game omitted; equal count → most recent first
    const skyjo = stats[1];
    expect(skyjo.matches).toBe(2);
    expect(skyjo.bestTotal).toEqual({ value: 12, holders: ["Anna", "Bela"], playedAt: "2025-01-01T12:00:00Z" });
    expect(skyjo.bestRound).toEqual({ value: -5, holders: ["Bela", "Anna"], playedAt: "2025-02-01T12:00:00Z" });
    expect(skyjo.champions).toEqual({ wins: 1, names: ["Anna", "Bela"] });
    expect(skyjo.avgPlayers).toBe(2.5);
    const uno = stats[0];
    expect(uno.bestTotal?.value).toBe(650);
    expect(uno.bestTotal?.holders).toEqual(["Anna"]);
    expect(uno.bestRound?.value).toBe(200);
    expect(uno.champions).toEqual({ wins: 1, names: ["Anna", "Cili"] });
  });

  it("computes personal bests and the best game", () => {
    const anna = personalBests(matches, games, "anna");
    expect(anna.map((b) => [b.gameId, b.matches, b.wins, b.losses, b.bestTotal, b.bestRound])).toEqual([
      ["skyjo", 2, 1, 1, 12, -5],
      ["uno", 2, 1, 1, 650, 150],
    ]);
    expect(personalBests(matches, games, "dani")[0].bestTotal).toBeNull(); // only a partial match
    expect(bestGame(anna)?.qualified).toBe(false); // nobody has 3 matches of a game yet
    expect(bestGame(anna, 2)?.game.gameId).toBe("skyjo");
    expect(bestGame([])).toBeNull();
  });
});
