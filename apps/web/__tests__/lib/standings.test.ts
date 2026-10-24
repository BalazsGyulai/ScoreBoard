import { describe, expect, it } from "vitest";
import fixtures from "../../../../packages/scoring/standings-cases.json";
import { computeStandings, gapLabel, joinNames, leaderboardRows, type WinnerRule } from "@/lib/scoring/standings";

type Case = {
  name: string;
  winner_rule: WinnerRule;
  scores: [string, number, number][];
  expected: { player: string; total: number; rounds: number; place: number }[];
  winners: string[];
  losers: string[];
};

describe("standings (shared cases with the Rust API)", () => {
  for (const c of (fixtures as unknown as { cases: Case[] }).cases) {
    it(c.name, () => {
      const result = computeStandings(
        c.scores.map(([user_id, round, value]) => ({ user_id, round, value })),
        c.winner_rule,
      );
      expect(result.rows.map((r) => ({ player: r.userId, total: r.total, rounds: r.roundsPlayed, place: r.place }))).toEqual(
        c.expected,
      );
      expect(result.winners).toEqual(c.winners);
      expect(result.losers).toEqual(c.losers);
    });
  }

  it("counts distinct rounds", () => {
    const r = computeStandings(
      [
        { user_id: "a", round: 1, value: 1 },
        { user_id: "b", round: 1, value: 1 },
        { user_id: "a", round: 2, value: 1 },
      ],
      "max",
    );
    expect(r.roundCount).toBe(2);
    expect(r.byPlayer.get("b")?.roundsPlayed).toBe(1);
  });
});

describe("joinNames", () => {
  it("joins Hungarian style", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Anna"])).toBe("Anna");
    expect(joinNames(["Anna", "Béla"])).toBe("Anna és Béla");
    expect(joinNames(["Anna", "Béla", "Cili"])).toBe("Anna, Béla és Cili");
    expect(joinNames(["Zoli", "Ádám"])).toBe("Ádám és Zoli"); // Hungarian alphabetical, any input order
  });
});

describe("running leaderboard (gap to leader)", () => {
  const entries = (list: [string, number, number][]) => list.map(([user_id, round, value]) => ({ user_id, round, value }));

  it("min game: behind means more points", () => {
    const s = computeStandings(entries([["a", 1, 3], ["b", 1, 7], ["c", 1, 3], ["a", 2, 1], ["b", 2, 1], ["c", 2, 2]]), "min");
    const rows = leaderboardRows(s, "min");
    expect(rows.map((r) => [r.userId, r.place, r.total, r.pointsBehind, r.roundsBehind])).toEqual([
      ["a", 1, 4, 0, 0],
      ["c", 2, 5, 1, 0],
      ["b", 3, 8, 4, 0],
    ]);
    expect(gapLabel(rows[0], s.winners.length)).toBe("Vezet");
    expect(gapLabel(rows[2], s.winners.length)).toBe("4 ponttal lemaradva");
  });

  it("max game: behind means fewer points", () => {
    const rows = leaderboardRows(computeStandings(entries([["a", 1, 10], ["b", 1, 25]]), "max"), "max");
    expect(rows.map((r) => [r.userId, r.pointsBehind])).toEqual([
      ["b", 0],
      ["a", 15],
    ]);
  });

  it("ties at the top and missing rounds", () => {
    const s = computeStandings(entries([["a", 1, 5], ["b", 1, 5], ["a", 2, 5], ["b", 2, 5], ["c", 1, 0]]), "min");
    const rows = leaderboardRows(s, "min");
    expect(rows.map((r) => [r.userId, r.place, r.pointsBehind, r.roundsBehind])).toEqual([
      ["a", 1, 0, 0],
      ["b", 1, 0, 0],
      ["c", 3, null, 1],
    ]);
    expect(gapLabel(rows[1], s.winners.length)).toBe("Holtverseny az élen");
    expect(gapLabel(rows[2], s.winners.length)).toBe("1 körrel kevesebb");
  });

  it("is empty without scores", () => {
    expect(leaderboardRows(computeStandings([], "max"), "max")).toEqual([]);
  });
});
