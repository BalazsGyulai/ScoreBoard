"use client";

import { useParams, useRouter } from "next/navigation";
import StatisticCard from "@/components/ui/statisticCard";
import ActionButton from "@/components/ui/actionButton";
import {
  players,
  avatarColors,
  gameBreakdown,
  activityData,
  activityLabels,
  rivals,
} from "@/lib/mockData";
import styles from "./player.module.css";

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const idx = Number(params.id) || 0;
  const p = players[idx] ?? players[0];
  const pct = Math.round((p.wins / p.games) * 100);
  const actMax = Math.max(...activityData);

  function prev() {
    const i = (idx - 1 + players.length) % players.length;
    router.push(`/players/${i}`);
  }

  function next() {
    const i = (idx + 1) % players.length;
    router.push(`/players/${i}`);
  }

  return (
    <div className="view">
      {/* ── Header ── */}
      <div className={styles["player-hdr"]}>
        <div
          className={`${styles.avatar} ${styles.av64}`}
          style={{ background: avatarColors[idx] ?? "#0F172A", color: "#fff" }}
        >
          {p.name[0]}
        </div>
        <div className={styles["player-hdr-info"]}>
          <div className={styles["player-pid"]}>{p.id}</div>
          <h1>{p.name}</h1>
          <div className={styles["player-sub"]}>
            {p.games} meccsből {p.wins} megnyerve · Legjobb: Skyjo
          </div>
        </div>
        <div className={styles["player-nav"]}>
          <ActionButton text="← Előző" variant="ghost" onClick={prev} />
          <ActionButton text="Következő →" variant="ghost" onClick={next} />
        </div>
      </div>

      {/* ── 4 stat cards ── */}
      <div className={styles.pstats4}>
        <StatisticCard label="Győzelmi arány" value={`${pct}%`} dark />
        <StatisticCard
          label="Győzelmek"
          value={String(p.wins)}
          subLabel={`${p.games} meccsből`}
        />
        <StatisticCard
          label="Vesztések"
          value={String(p.losses)}
          subLabel={`${p.games} meccsből`}
        />
        <StatisticCard
          label="Legjobb sorozat"
          value={`${3 + idx} 🔥`}
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
