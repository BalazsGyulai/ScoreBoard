import Link from "next/link";
import { players, avatarColors, streaks } from "@/lib/mockData";
import styles from "./stats.module.css";

export default function StatsPage() {
  const sorted = [...players].sort(
    (a, b) => b.wins / b.games - a.wins / a.games,
  );

  return (
    <div className="view">
      <div className={styles["page-top"]}>
        <h1>Statisztika</h1>
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
                        <Link
                          href={`/players/${origIdx}`}
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
