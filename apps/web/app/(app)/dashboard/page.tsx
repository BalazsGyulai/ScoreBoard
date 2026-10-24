"use client";

import { fetchJson } from "@/lib/api/client";

import StatisticCard from "@/components/ui/statisticCard";
import ScoreCard from "@/components/ui/scoreCard";
import Link from "next/link";
import useSWR from "swr";
import { Leaderboard, statsStyles } from "@/components/stats/ui";
import { joinNames } from "@/lib/scoring/standings";
import type { OverviewView } from "@/lib/stats/views";
import styles from "./dashboard.module.css";

function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("hu-HU", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Budapest" }).format(now));
  if (hour < 10) return "Jó reggelt";
  if (hour < 18) return "Szia";
  return "Jó estét";
}

export default function Dashboard() {
  const { data, error } = useSWR<OverviewView>("/api/dashboard/overview", fetchJson);
  const loading = !data && !error;

  const best = data?.bestGame;
  const active = data?.mostActive;

  return (
    <div className="view">
      <div className={styles["dash-top"]}>
        <h1>
          {greeting()}, <span className={styles.orange}>{data?.username ?? "…"}</span> 👋
        </h1>
        <p>
          {error
            ? (error as Error).message
            : data
              ? `${data.totalMatches} meccs · ${data.playerCount} játékos · Utoljára játszva: ${data.lastPlayed}`
              : "Betöltés..."}
        </p>
      </div>

      {/* ── 4 stat cards ── */}
      <div className={styles.stats4}>
        <StatisticCard
          label="Győzelmi arányod"
          value={loading ? "…" : `${data?.me.winRate ?? 0}%`}
          subLabel={data ? (data.me.matches > 0 ? `${data.me.wins} győzelem / ${data.me.matches} meccs` : "Még nincs lezárt meccsed") : ""}
          dark
        />
        <StatisticCard
          label="Összes meccs"
          value={loading ? "…" : String(data?.totalMatches ?? 0)}
          subLabel={data ? `${data.playedGames} különböző játék` : ""}
        />
        <StatisticCard
          label="Legjobb játékod"
          value={loading ? "…" : best ? `${best.icon} ${best.name}` : "Nincs adat"}
          subLabel={
            best
              ? best.qualified
                ? `${best.wins} győzelem / ${best.matches} meccs`
                : `legtöbbet játszott · ${best.matches} meccs`
              : ""
          }
        />
        <StatisticCard
          label="Legaktívabb"
          value={loading ? "…" : active ? joinNames(active.names) : "Nincs adat"}
          subLabel={active ? `${active.matches} meccsen játszott` : ""}
        />
      </div>

      {/* ── 2-column: Leaderboard + Recent games ── */}
      <div className={styles.dash2}>
        <ScoreCard
          title="Ranglista"
          extraElement={
            <Link href="/stats" className={styles["btn-ghost"]}>
              Részletek →
            </Link>
          }
        >
          {data && <Leaderboard board={data.leaderboard} limit={6} />}
          {data && data.leaderboard.unranked.length > 0 && (
            <p className={statsStyles["card-hint"]}>
              + {data.leaderboard.unranked.length} játékos kevesebb mint {data.leaderboard.minMatches} meccsel (a Statisztikában)
            </p>
          )}
        </ScoreCard>

        <ScoreCard
          title="Legutóbbi meccsek"
          extraElement={
            <Link href="/games" className={styles["btn-ghost"]}>
              Mind →
            </Link>
          }
        >
          {data && data.recent.length === 0 && <p className={statsStyles.empty}>Még nincs játék.</p>}
          {data?.recent.map((r) => (
            <Link href={`/games/${encodeURIComponent(r.slug)}`} key={r.key} className={styles["rg-row"]}>
              <div className={styles["rg-icon"]}>{r.icon}</div>
              <div className={styles["rg-info"]}>
                <div className={styles["rg-name"]}>{r.name}</div>
                <div className={styles["rg-meta"]}>{r.info}</div>
              </div>
              {r.names.length > 0 && (
                <span className={`${styles["rg-winner"]} ${r.status === "open" ? styles["rg-live"] : ""}`}>
                  {r.status === "open" ? "Vezet: " : "🏆 "}
                  {joinNames(r.names)}
                </span>
              )}
            </Link>
          ))}
        </ScoreCard>
      </div>
    </div>
  );
}
