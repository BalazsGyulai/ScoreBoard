"use client";

import StatisticCard from "@/components/ui/statisticCard";
import ScoreCard from "@/components/ui/scoreCard";
import Link from "next/link";
import useSWR from "swr";
import { players, avatarColors, recentGames, streaks } from "@/lib/mockData";
import styles from "./dashboard.module.css";

type DashboardCardData = {
  value: string;
  subLabel: string;
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

  const sorted = [...players].sort(
    (a, b) => b.wins / b.games - a.wins / a.games,
  );

  return (
    <div className="view">
      <div className={styles["dash-top"]}>
        <h1>
          Jó estét, <span className={styles.orange}>Bali</span> 👋
        </h1>
        <p>47 meccs rögzítve · 7 játékos · Utoljára játszva: ma</p>
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
            const pct = Math.round((p.wins / p.games) * 100);
            const rankClass =
              i === 0
                ? styles.r1
                : i === 1
                  ? styles.r2
                  : i === 2
                    ? styles.r3
                    : "";
            const origIdx = players.indexOf(p);
            return (
              <Link
                href={`/players/${origIdx}`}
                key={p.id}
                className={styles["lb-row"]}
              >
                <div className={`${styles["lb-rank"]} ${rankClass}`}>
                  {i + 1}
                </div>
                <div
                  className={`${styles.avatar} ${styles.av36}`}
                  style={{
                    background: avatarColors[origIdx],
                    color: "#fff",
                  }}
                >
                  {p.name[0]}
                </div>
                <div className={styles["lb-name"]}>{p.name}</div>
                <div className={styles["lb-games-ct"]}>{p.games} meccs</div>
                <div className={styles["lb-bar-w"]}>
                  <div className={styles["bar-track"]}>
                    <div
                      className={styles["bar-fill"]}
                      style={{
                        width: `${pct}%`,
                        background: "var(--orange)",
                      }}
                    />
                  </div>
                </div>
                <div className={styles["lb-pct"]}>{pct}%</div>
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
          {recentGames.map((r) => (
            <Link
              href="/games/skyjo"
              key={r.name}
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
                {sorted.map((p, i) => {
                  const pct = Math.round((p.wins / p.games) * 100);
                  const origIdx = players.indexOf(p);
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
                              background: avatarColors[origIdx],
                              color: "#fff",
                              fontSize: 12,
                            }}
                          >
                            {p.name[0]}
                          </div>
                          <span style={{ fontWeight: 500, fontSize: 14 }}>
                            {p.name}
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
                      <td style={{ color: "var(--slate-500)" }}>{p.games}</td>
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
                        {streaks[origIdx]} 🔥
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
                          {[3, 5, 8, 4, 7, 6, 5].map((h, bi) => (
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
