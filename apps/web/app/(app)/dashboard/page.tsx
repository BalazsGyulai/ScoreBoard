"use client";

import StatisticCard from "@/components/ui/statisticCard";
import ScoreCard from "@/components/ui/scoreCard";
import Link from "next/link";
import useSWR from "swr";
import styles from "./dashboard.module.css";

type DashboardCardData = {
  value: string;
  subLabel: string;
};

type DashboardHeaderData = {
  username: string;
  games: number;
  players: number;
  lastPlayed: string;
};

type LeaderboardRow = {
  id: string;
  username: string;
  wins: number;
  losses: number;
  total_rounds: number;
  win_rate: number;
};

type RecentGameRow = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  info: string;
  winner: string;
};

type SummaryTableRow = LeaderboardRow & {
  streak: number;
  trend: number[];
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
  const palette = [
    "#0F172A",
    "#F97316",
    "#7C3AED",
    "#0EA5E9",
    "#16A34A",
    "#EF4444",
    "#334155",
  ];
  const hash = [...seed].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

export default function Dashboard() {
  const { data: winRateCard } = useSWR<DashboardCardData>(
    "/api/dashboard/win-rate",
    fetchJson,
  );
  const { data: totalMatchesCard } = useSWR<DashboardCardData>(
    "/api/dashboard/total-matches",
    fetchJson,
  );
  const { data: bestGameCard } = useSWR<DashboardCardData>(
    "/api/dashboard/best-game",
    fetchJson,
  );
  const { data: mostActiveCard } = useSWR<DashboardCardData>(
    "/api/dashboard/most-active",
    fetchJson,
  );
  const { data: leaderboardRows } = useSWR<LeaderboardRow[]>(
    "/api/dashboard/leaderboard",
    fetchJson,
  );
  const { data: recentGames } = useSWR<RecentGameRow[]>(
    "/api/dashboard/recent-games",
    fetchJson,
  );
  const { data: summaryRows } = useSWR<SummaryTableRow[]>(
    "/api/dashboard/summary-table",
    fetchJson,
  );
  const { data: headerData } = useSWR<DashboardHeaderData>(
    "/api/dashboard/header",
    fetchJson,
  );

  const sorted = leaderboardRows ?? [];
  const summary = summaryRows ?? [];

  return (
    <div className="view">
      <div className={styles["dash-top"]}>
        <h1>
          Jó estét,{" "}
          <span className={styles.orange}>
            {headerData?.username ?? "Jatekos"}
          </span>{" "}
          👋
        </h1>
        <p>
          {headerData
            ? `${headerData.games} meccs rogzitve · ${headerData.players} jatekos · Utoljara jatszva: ${headerData.lastPlayed}`
            : "Betoltes..."}
        </p>
      </div>

      {/* ── 4 stat cards ── */}
      <div className={styles.stats4}>
        <StatisticCard
          label="Győzelmi arány"
          value={winRateCard?.value ?? "..."}
          subLabel={winRateCard?.subLabel ?? "Betoltes..."}
          dark
        />
        <StatisticCard
          label="Összes meccs"
          value={totalMatchesCard?.value ?? "..."}
          subLabel={totalMatchesCard?.subLabel ?? "Betoltes..."}
        />
        <StatisticCard
          label="Legjobb játék"
          value={bestGameCard?.value ?? "..."}
          subLabel={bestGameCard?.subLabel ?? "Betoltes..."}
        />
        <StatisticCard
          label="Legtöbb aktív"
          value={mostActiveCard?.value ?? "..."}
          subLabel={mostActiveCard?.subLabel ?? "Betoltes..."}
        />
      </div>

      {/* ── 2-column: Leaderboard + Recent games ── */}
      <div className={styles.dash2}>
        <ScoreCard
          title="Ranglista"
          extraElement={
            <span className={styles.muted} style={{ fontSize: 12 }}>
              Win %
            </span>
          }
        >
          {sorted.map((p, i) => {
            const rankClass =
              i === 0
                ? styles.r1
                : i === 1
                  ? styles.r2
                  : i === 2
                    ? styles.r3
                    : "";
            return (
              <Link
                href={`/players/${i}`}
                key={p.id}
                className={styles["lb-row"]}
              >
                <div className={`${styles["lb-rank"]} ${rankClass}`}>
                  {i + 1}
                </div>
                <div
                  className={`${styles.avatar} ${styles.av36}`}
                  style={{
                    background: avatarColor(p.id),
                    color: "#fff",
                  }}
                >
                  {p.username[0]}
                </div>
                <div className={styles["lb-name"]}>{p.username}</div>
                <div className={styles["lb-games-ct"]}>{p.total_rounds} kor</div>
                <div className={styles["lb-bar-w"]}>
                  <div className={styles["bar-track"]}>
                    <div
                      className={styles["bar-fill"]}
                      style={{
                        width: `${p.win_rate}%`,
                        background: "var(--orange)",
                      }}
                    />
                  </div>
                </div>
                <div className={styles["lb-pct"]}>{p.win_rate}%</div>
              </Link>
            );
          })}
        </ScoreCard>

        <ScoreCard
          title="Legutóbbi meccsek"
          extraElement={
            <Link
              href="/games"
              className={styles["btn-ghost"]}
            >
              Mind →
            </Link>
          }
        >
          {(recentGames ?? []).map((r) => (
            <Link
              href={`/games/${encodeURIComponent(r.slug)}`}
              key={r.id}
              className={styles["rg-row"]}
            >
              <div className={styles["rg-icon"]}>{r.icon}</div>
              <div className={styles["rg-info"]}>
                <div className={styles["rg-name"]}>{r.name}</div>
                <div className={styles["rg-meta"]}>{r.info}</div>
              </div>
              <span className={styles["rg-winner"]}>🏆 {r.winner}</span>
            </Link>
          ))}
        </ScoreCard>
      </div>

      {/* ── Head-to-head table ── */}
      <div className={`${styles.card} ${styles.dash3}`}>
        <div className={styles.p24}>
          <div className={styles["section-hdr"]}>
            <h2>Összesített táblázat</h2>
          </div>
          <div className={styles.ovx}>
            <table className={styles["hth-table"]}>
              <thead>
                <tr>
                  <th>Játékos</th>
                  <th>Győzelmek</th>
                  <th>Vesztések</th>
                  <th>Meccsek</th>
                  <th>Win %</th>
                  <th>Legjobb sorozat</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((p) => {
                  const pct = p.win_rate;
                  const barColor =
                    pct >= 60
                      ? "var(--success)"
                      : pct >= 40
                        ? "var(--orange)"
                        : "var(--danger)";
                  return (
                    <tr key={p.id}>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <div
                            className={`${styles.avatar} ${styles.av36}`}
                            style={{
                              background: avatarColor(p.id),
                              color: "#fff",
                              fontSize: 12,
                            }}
                          >
                            {p.username[0]}
                          </div>
                          <span style={{ fontWeight: 500, fontSize: 14 }}>
                            {p.username}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontWeight: 600,
                            color: "var(--success)",
                          }}
                        >
                          {p.wins}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: "var(--danger)" }}>
                          {p.losses}
                        </span>
                      </td>
                      <td style={{ color: "var(--slate-500)" }}>{p.total_rounds}</td>
                      <td>
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <div
                            style={{
                              width: 44,
                              height: 5,
                              background: "var(--slate-100)",
                              borderRadius: 99,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                background: barColor,
                                borderRadius: 99,
                              }}
                            />
                          </div>
                          <strong style={{ fontSize: 13 }}>{pct}%</strong>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {p.streak} 🔥
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-end",
                            gap: 2,
                            height: 21,
                            justifyContent: "center",
                          }}
                        >
                          {p.trend.map((h, bi) => (
                            <div
                              key={bi}
                              style={{
                                flex: 1,
                                height: h * 3,
                                borderRadius: "3px 3px 0 0",
                                background: barColor,
                                opacity: 0.4 + bi * 0.08,
                              }}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
