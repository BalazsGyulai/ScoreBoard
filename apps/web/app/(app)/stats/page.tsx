"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import styles from "./stats.module.css";

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

export default function StatsPage() {
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

  const { data: leaderboardRows } = useSWR<LeaderboardRow[]>(
    `/api/dashboard/leaderboard?year=${selectedYear}`,
    fetchJson,
  );
  const { data: summaryRows } = useSWR<SummaryTableRow[]>(
    `/api/dashboard/summary-table?year=${selectedYear}`,
    fetchJson,
  );
  const sorted = leaderboardRows ?? [];
  const summary = summaryRows ?? [];

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
      <div className={styles["page-top"]}>
        <div className={styles["title-row"]}>
          <h1>Statisztika</h1>
          <div className={styles["year-controls"]}>
            <button
              className={styles["year-nav-btn"]}
              onClick={prevYear}
              type="button"
            >
              ← Előző
            </button>
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
            <button
              className={styles["year-nav-btn"]}
              onClick={nextYear}
              type="button"
            >
              Következő →
            </button>
          </div>
        </div>
        <p>Csoport ranglista és összesített eredmények</p>
      </div>

      {/* ── Full leaderboard ── */}
      <div className={`${styles.card} ${styles.section}`}>
        <div className={styles.p24}>
          <div className={styles["section-hdr"]}>
            <h2>Ranglista</h2>
            <span className={styles.muted} style={{ fontSize: 12 }}>
              Win %
            </span>
          </div>
          {sorted.map((p, i) => {
            const pct = p.win_rate;
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
                href={`/players/${p.id}`}
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
                <div className={styles["lb-games-ct"]}>{p.total_rounds} kör</div>
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
        </div>
      </div>

      {/* ── Head-to-head table ── */}
      <div className={`${styles.card} ${styles.section}`}>
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
                        <Link
                          href={`/players/${p.id}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            textDecoration: "none",
                            color: "inherit",
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
                        </Link>
                      </td>
                      <td>
                        <span
                          style={{ fontWeight: 600, color: "var(--success)" }}
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
                          {(() => {
                            const maxPlace = Math.max(...p.trend, 1);
                            return p.trend.map((h, bi) => (
                              <div
                                key={bi}
                                style={{
                                  flex: 1,
                                  height: Math.max(3, ((maxPlace - h + 1) / maxPlace) * 21),
                                  borderRadius: "3px 3px 0 0",
                                  background: barColor,
                                  opacity: 0.4 + bi * 0.08,
                                }}
                              />
                            ));
                          })()}
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
