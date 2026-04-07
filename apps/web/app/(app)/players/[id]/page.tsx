"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import StatisticCard from "@/components/ui/statisticCard";
import ActionButton from "@/components/ui/actionButton";
import type { ApiGame, ApiPlayer, ApiScoreRow } from "@/types/api";
import styles from "./player.module.css";

type LeaderboardRow = {
  id: string;
  username: string;
  wins: number;
  losses: number;
  total_rounds: number;
  win_rate: number;
};

type SummaryTableRow = LeaderboardRow & {
  streak: number;
  trend: number[];
};

type RivalRow = {
  name: string;
  pct: number;
  color: string;
};

type GameBreakdownRow = {
  name: string;
  icon: string;
  wins: number;
  losses: number;
  games: number;
};

type PlayerDerivedData = {
  gameBreakdown: GameBreakdownRow[];
  activityData: number[];
  activityLabels: string[];
  rivals: RivalRow[];
  bestGameName: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Hiba (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      message = data.error ?? message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

function avatarColor(seed: string) {
  const palette = ["#0F172A", "#475569", "#B45309", "#94A3B8", "#CBD5E1", "#E2E8F0", "#F1F5F9"];
  const hash = [...seed].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("hu-HU", { month: "short" });
}

function monthLabelFromIndex(month: number) {
  return new Date(2026, month, 1).toLocaleDateString("hu-HU", { month: "short" });
}

function rivalColor(pct: number) {
  if (pct >= 60) return "var(--success)";
  if (pct >= 40) return "var(--orange)";
  return "var(--danger)";
}

function winnerBetween(a: number, b: number, winnerRule: ApiGame["winner_rule"]) {
  return winnerRule === "min" ? a < b : a > b;
}

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const routeParam = String(params.id ?? "");
  const { data: availableYears } = useSWR<number[]>(
    "/api/dashboard/stats-years",
    fetchJson,
  );
  const [selectedYear, setSelectedYear] = useState<string>("overall");
  const selectedYearValue = selectedYear === "overall" ? null : Number.parseInt(selectedYear, 10);
  const selectedYearIndex = useMemo(() => {
    if (!availableYears || selectedYearValue === null) return -1;
    return availableYears.findIndex((year) => year === selectedYearValue);
  }, [availableYears, selectedYearValue]);

  const { data: players } = useSWR<ApiPlayer[]>("/api/players", fetchJson);
  const { data: leaderboardRows } = useSWR<LeaderboardRow[]>(
    `/api/dashboard/leaderboard?year=${selectedYear}`,
    fetchJson,
  );
  const { data: summaryRows } = useSWR<SummaryTableRow[]>(
    `/api/dashboard/summary-table?year=${selectedYear}`,
    fetchJson,
  );
  const { data: games } = useSWR<ApiGame[]>("/api/games", fetchJson);

  const orderedRows = leaderboardRows ?? [];
  const fallbackIdx = Number(routeParam);
  const selectedFromId = orderedRows.findIndex((row) => row.id === routeParam);
  const selectedIndex =
    selectedFromId >= 0
      ? selectedFromId
      : Number.isFinite(fallbackIdx) && fallbackIdx >= 0 && fallbackIdx < orderedRows.length
        ? fallbackIdx
        : 0;

  const selected = orderedRows[selectedIndex] ?? null;

  const { data: derivedData } = useSWR<PlayerDerivedData>(
    selected && games
      ? ["player-derived", selected.id, selectedYear, games.map((g) => g.id).join(",")]
      : null,
    async () => {
      if (!selected || !games) {
        return {
          gameBreakdown: [],
          activityData: [],
          activityLabels: [],
          rivals: [],
          bestGameName: "N/A",
        };
      }

      const scoreRowsByGame = await Promise.all(
        games.map(async (game) => ({
          game,
          scores: await fetchJson<ApiScoreRow[]>(`/api/games/${game.id}/scores`),
        })),
      );

      const gameBreakdown: GameBreakdownRow[] = [];
      const monthlyCounts = new Map<string, number>();
      const rivalDuelMap = new Map<string, { wins: number; total: number }>();

      for (const { game, scores } of scoreRowsByGame) {
        const rounds = new Map<number, ApiScoreRow[]>();
        for (const s of scores) {
          if (!rounds.has(s.round)) rounds.set(s.round, []);
          rounds.get(s.round)!.push(s);
        }

        let wins = 0;
        let losses = 0;
        for (const roundScores of rounds.values()) {
          const me = roundScores.find((r) => r.user_id === selected.id);
          if (!me) continue;
          const playedAt = new Date(me.recorded_at);
          if (selectedYearValue !== null && playedAt.getFullYear() !== selectedYearValue) {
            continue;
          }
          const key = `${playedAt.getFullYear()}-${playedAt.getMonth()}`;
          monthlyCounts.set(key, (monthlyCounts.get(key) ?? 0) + 1);

          const values = roundScores.map((r) => r.value);
          const best = game.winner_rule === "min" ? Math.min(...values) : Math.max(...values);
          if (me.value === best) wins += 1;
          else losses += 1;

          for (const other of roundScores) {
            if (other.user_id === selected.id) continue;
            const duel = rivalDuelMap.get(other.user_id) ?? { wins: 0, total: 0 };
            duel.total += 1;
            if (winnerBetween(me.value, other.value, game.winner_rule)) duel.wins += 1;
            rivalDuelMap.set(other.user_id, duel);
          }
        }

        if (wins + losses > 0) {
          gameBreakdown.push({
            name: game.name,
            icon: game.icon,
            wins,
            losses,
            games: wins + losses,
          });
        }
      }

      gameBreakdown.sort((a, b) => b.games - a.games || b.wins - a.wins);
      const bestGame =
        gameBreakdown.length > 0
          ? [...gameBreakdown].sort(
              (a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games,
            )[0]
          : null;

      const activityMonths =
        selectedYearValue !== null
          ? Array.from({ length: 12 }, (_, month) => ({
              key: `${selectedYearValue}-${month}`,
              label: monthLabelFromIndex(month),
            }))
          : Array.from({ length: 12 }, (_, i) => {
              const now = new Date();
              const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
              return {
                key: `${d.getFullYear()}-${d.getMonth()}`,
                label: monthLabel(d),
              };
            });

      const activityLabels = activityMonths.map((m) => m.label);
      const activityData = activityMonths.map((m) => monthlyCounts.get(m.key) ?? 0);

      const rivals = Array.from(rivalDuelMap.entries())
        .map(([userId, duel]) => {
          const rivalName = players?.find((p) => p.id === userId)?.username ?? "Ismeretlen";
          const pct = duel.total > 0 ? Math.round((duel.wins / duel.total) * 100) : 0;
          return {
            name: rivalName,
            pct,
            total: duel.total,
            color: rivalColor(pct),
          };
        })
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total || b.pct - a.pct)
        .slice(0, 3)
        .map(({ name, pct, color }) => ({ name, pct, color }));

      return {
        gameBreakdown,
        activityData,
        activityLabels,
        rivals,
        bestGameName: bestGame?.name ?? "N/A",
      };
    },
  );

  const pct = selected?.win_rate ?? 0;
  const totalGames = selected?.total_rounds ?? 0;
  const wins = selected?.wins ?? 0;
  const losses = selected?.losses ?? 0;
  const streak = summaryRows?.find((row) => row.id === selected?.id)?.streak ?? 0;
  const activityData = derivedData?.activityData ?? [];
  const activityLabels = derivedData?.activityLabels ?? [];
  const gameBreakdown = derivedData?.gameBreakdown ?? [];
  const rivals = derivedData?.rivals ?? [];
  const actMax = Math.max(...activityData, 1);

  function prev() {
    if (!orderedRows.length) return;
    const i = (selectedIndex - 1 + orderedRows.length) % orderedRows.length;
    router.push(`/players/${orderedRows[i].id}`);
  }

  function next() {
    if (!orderedRows.length) return;
    const i = (selectedIndex + 1) % orderedRows.length;
    router.push(`/players/${orderedRows[i].id}`);
  }

  function prevYear() {
    if (!availableYears || availableYears.length === 0) return;
    if (selectedYear === "overall") {
      setSelectedYear(String(availableYears[0]));
      return;
    }
    if (selectedYearIndex < 0) return;
    const target = availableYears[selectedYearIndex + 1];
    if (target === undefined) {
      setSelectedYear("overall");
      return;
    }
    setSelectedYear(String(target));
  }

  function nextYear() {
    if (!availableYears || availableYears.length === 0) return;
    if (selectedYear === "overall") return;
    if (selectedYearIndex <= 0) {
      setSelectedYear(String(availableYears[0]));
      return;
    }
    const target = availableYears[selectedYearIndex - 1];
    if (target !== undefined) setSelectedYear(String(target));
  }

  return (
    <div className="view">
      {/* ── Header ── */}
      <div className={styles["player-hdr"]}>
        <div
          className={`${styles.avatar} ${styles.av64}`}
          style={{ background: avatarColor(selected?.id ?? "fallback"), color: "#fff" }}
        >
          {selected?.username?.[0] ?? "?"}
        </div>
        <div className={styles["player-hdr-info"]}>
          <div className={styles["player-pid"]}>{selected?.id ?? "..."}</div>
          <h1>{selected?.username ?? "Betöltés..."}</h1>
          <div className={styles["player-sub"]}>
            {totalGames} meccsből {wins} megnyerve · Legjobb: {derivedData?.bestGameName ?? "..."}
          </div>
        </div>
        <div className={styles["player-nav"]}>
          <ActionButton text="← Előző" variant="ghost" onClick={prev} />
          
          <select
            className={styles["year-select"]}
            value={selectedYear}
            onChange={(event) => setSelectedYear(event.target.value)}
          >
            <option value="overall">Összes év</option>
            {(availableYears ?? []).map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
          
          <ActionButton text="Következő →" variant="ghost" onClick={next} />
        </div>
      </div>

      {/* ── 4 stat cards ── */}
      <div className={styles.pstats4}>
        <StatisticCard label="Győzelmi arány" value={`${pct}%`} dark />
        <StatisticCard
          label="Győzelmek"
          value={String(wins)}
          subLabel={`${totalGames} meccsből`}
        />
        <StatisticCard
          label="Vesztések"
          value={String(losses)}
          subLabel={`${totalGames} meccsből`}
        />
        <StatisticCard
          label="Legjobb sorozat"
          value={`${streak} 🔥`}
          subLabel="egymás utáni győzelem"
        />
      </div>

      {/* ── 2-column bottom ── */}
      <div className={styles.pdash2}>
        {/* Left: game breakdown */}
        <div className={styles.card}>
          <div className={styles.p24}>
            <div className={styles["section-hdr"]}>
              <h2>Játékonkénti eredmények</h2>
            </div>
            <div className={styles["pgi-wrap"]}>
              {gameBreakdown.map((g) => (
                <div className={styles["pgi-row"]} key={g.name}>
                  <div className={styles["pgi-name"]}>
                    <span style={{ fontSize: 18 }}>{g.icon}</span>
                    {g.name}
                  </div>
                  <div className={styles["pgi-stats"]}>
                    <div className={styles["pgi-stat"]}>
                      <div className={`${styles.v} ${styles.green}`}>
                        {g.wins}
                      </div>
                      <div className={styles.l}>Győz</div>
                    </div>
                    <div className={styles["pgi-stat"]}>
                      <div className={`${styles.v} ${styles.red}`}>
                        {g.losses}
                      </div>
                      <div className={styles.l}>Veszt</div>
                    </div>
                    <div className={styles["pgi-stat"]}>
                      <div className={styles.v}>
                        {Math.round((g.wins / g.games) * 100)}%
                      </div>
                      <div className={styles.l}>Win%</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div>
          {/* Activity chart */}
          <div
            className={styles.card}
            style={{ padding: 24, marginBottom: 14 }}
          >
            <div className={styles["section-hdr"]}>
              <h2>Havi aktivitás</h2>
            </div>
            <div className={styles["act-bars"]}>
              {activityData.map((v, i) => (
                <div className={styles["act-bar-wrap"]} key={i}>
                  <div className={styles["act-val"]}>{v}</div>
                  <div className={styles["act-bar-inner"]}>
                    <div
                      className={styles["act-bar"]}
                      style={{
                        height: Math.max(6, (v / actMax) * 84),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 6,
              }}
            >
              {activityLabels.map((label) => (
                <span className={styles["act-label"]} key={label}>
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Rivals */}
          <div className={styles.card} style={{ padding: 24 }}>
            <div className={styles["section-hdr"]}>
              <h2>Eredmény ellenfeleknél</h2>
            </div>
            {rivals.map((r) => (
              <div className={styles["rival-row"]} key={r.name}>
                <div
                  className={`${styles.avatar} ${styles.av36}`}
                  style={{
                    background: "var(--slate-100)",
                    color: "var(--slate-700)",
                    fontSize: 13,
                  }}
                >
                  {r.name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      marginBottom: 5,
                    }}
                  >
                    {r.name} ellen
                  </div>
                  <div className={styles["bar-track"]}>
                    <div
                      className={styles["bar-fill"]}
                      style={{
                        width: `${r.pct}%`,
                        background: r.color,
                      }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: r.color,
                  }}
                >
                  {r.pct}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
