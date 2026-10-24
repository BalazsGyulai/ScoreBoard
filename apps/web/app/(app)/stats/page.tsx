"use client";

import { fetchJson } from "@/lib/api/client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Avatar, FormChips, Leaderboard, YearFilter, statsStyles as ui } from "@/components/stats/ui";
import { joinNames } from "@/lib/scoring/standings";
import { formatLocalDate } from "@/lib/stats/time";
import type { RankedPlayer, StatsView } from "@/lib/stats/views";
import styles from "./stats.module.css";

const tabs = [
  { id: "ranking", label: "Ranglista" },
  { id: "games", label: "Játékok" },
  { id: "rivals", label: "Párharcok" },
  { id: "form", label: "Forma" },
] as const;
type Tab = (typeof tabs)[number]["id"];

export default function StatsPage() {
  const [year, setYear] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("ranking");
  const { data, error } = useSWR<StatsView>(`/api/dashboard/stats?year=${year ?? "overall"}`, fetchJson, {
    keepPreviousData: true,
  });

  return (
    <div className="view">
      <div className={styles["page-top"]}>
        <div className={styles["title-row"]}>
          <h1>Statisztika</h1>
          <YearFilter years={data?.years ?? []} value={year} onChange={setYear} />
        </div>
        <p>
          {error
            ? (error as Error).message
            : data
              ? `${year ?? "Összes év"} · ${data.totalMatches} lezárt meccs`
              : "Betöltés..."}
        </p>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Statisztika nézetek">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.tab} ${tab === t.id ? styles["tab-active"] : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {data && tab === "ranking" && <RankingTab data={data} />}
      {data && tab === "games" && <GamesTab data={data} />}
      {data && tab === "rivals" && <RivalsTab data={data} />}
      {data && tab === "form" && <FormTab data={data} />}
    </div>
  );
}

function RankingTab({ data }: { data: StatsView }) {
  const everyone = [...data.leaderboard.ranked, ...data.leaderboard.unranked];
  return (
    <>
      <section className={ui.card}>
        <div className={ui["card-hdr"]}>
          <h2>Ranglista</h2>
          <span className={ui["card-hint"]}>győzelmi arány</span>
        </div>
        <Leaderboard board={data.leaderboard} />
        <p className={ui["card-hint"]} style={{ marginTop: 10 }}>
          Rangsorolva legalább {data.leaderboard.minMatches} meccstől. A sorrend a meccsek számát is figyelembe veszi:
          kevés meccsnél a győzelmi arány a várható arány felé húz (2 fős meccsen 50%, 4 fősön 25%).
        </p>
      </section>

      <section className={ui.card}>
        <div className={ui["card-hdr"]}>
          <h2>Összesített táblázat</h2>
        </div>
        {everyone.length === 0 ? (
          <p className={ui.empty}>Nincs adat.</p>
        ) : (
          <div className={styles.ovx} data-table-scroll>
            <table className={styles["hth-table"]}>
              <thead>
                <tr>
                  <th>Játékos</th>
                  <th>#</th>
                  <th>Meccs</th>
                  <th>Győzelem</th>
                  <th>Utolsó hely</th>
                  <th>Win %</th>
                  <th>Legjobb sorozat</th>
                  <th>Forma</th>
                </tr>
              </thead>
              <tbody>
                {everyone.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/players/${p.id}`} className={styles["player-link"]}>
                        <Avatar id={p.id} name={p.username} />
                        <span>{p.username}</span>
                      </Link>
                    </td>
                    <td>{p.rank ?? "–"}</td>
                    <td>{p.matches}</td>
                    <td className={styles.good}>{p.wins}</td>
                    <td className={styles.bad}>{p.losses}</td>
                    <td>
                      <strong>{p.winRate}%</strong>
                    </td>
                    <td>{p.bestWinStreak > 0 ? `${p.bestWinStreak} 🔥` : "–"}</td>
                    <td>
                      <FormChips form={p.form} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function GamesTab({ data }: { data: StatsView }) {
  if (data.games.length === 0) {
    return <section className={ui.card}><p className={ui.empty}>Még nincs lezárt meccs ebben az időszakban.</p></section>;
  }
  const most = Math.max(...data.games.map((g) => g.matches));
  return (
    <>
      <section className={ui.card}>
        <div className={ui["card-hdr"]}>
          <h2>Legtöbbet játszott</h2>
        </div>
        {data.games.map((g) => (
          <div key={g.gameId} className={styles["bar-row"]}>
            <span className={styles["bar-label"]}>
              {g.icon} {g.name}
            </span>
            <div className={styles["bar-track"]}>
              <div className={styles["bar-fill"]} style={{ width: `${(g.matches / most) * 100}%` }} />
            </div>
            <span className={styles["bar-value"]}>{g.matches}</span>
          </div>
        ))}
      </section>

      <div className={styles["game-grid"]}>
        {data.games.map((g) => (
          <section key={g.gameId} className={ui.card} data-testid="game-record">
            <div className={ui["card-hdr"]}>
              <h2>
                {g.icon} {g.name}
              </h2>
              <span className={ui["card-hint"]}>{g.winnerRule === "min" ? "kevesebb nyer" : "több nyer"}</span>
            </div>
            <p className={ui["card-hint"]}>
              {g.matches} meccs · átlag {g.avgPlayers} játékos · utoljára {formatLocalDate(g.lastPlayedAt)}
            </p>
            <dl className={styles.records}>
              <div>
                <dt>Bajnok</dt>
                <dd>{g.champions ? `${joinNames(g.champions.names)} (${g.champions.wins} győzelem)` : "–"}</dd>
              </div>
              <div>
                <dt>Legjobb végeredmény</dt>
                <dd>
                  {g.bestTotal
                    ? `${g.bestTotal.value} pont — ${joinNames(g.bestTotal.holders)} (${formatLocalDate(g.bestTotal.playedAt)})`
                    : "–"}
                </dd>
              </div>
              <div>
                <dt>Legjobb kör</dt>
                <dd>{g.bestRound ? `${g.bestRound.value} pont — ${joinNames(g.bestRound.holders)}` : "–"}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}

function RivalsTab({ data }: { data: StatsView }) {
  return (
    <section className={ui.card}>
      <div className={ui["card-hdr"]}>
        <h2>Párharcok</h2>
        <span className={ui["card-hint"]}>közös meccsek, ki végzett előrébb</span>
      </div>
      {data.rivalries.length === 0 && <p className={ui.empty}>Még nincs olyan pár, aki legalább 2 meccsen együtt játszott.</p>}
      {data.rivalries.map((r) => {
        const total = r.played;
        return (
          <div key={`${r.a.id}-${r.b.id}`} className={styles.rival}>
            <div className={styles["rival-names"]}>
              <Link href={`/players/${r.a.id}`}>{r.a.username}</Link>
              <span className={styles["rival-score"]}>
                {r.aWins} – {r.draws} – {r.bWins}
              </span>
              <Link href={`/players/${r.b.id}`}>{r.b.username}</Link>
            </div>
            <div className={styles["rival-bar"]} aria-hidden="true">
              <span style={{ flex: r.aWins / total, background: "var(--slate-900)" }} />
              <span style={{ flex: r.draws / total, background: "var(--slate-200)" }} />
              <span style={{ flex: r.bWins / total, background: "var(--orange)" }} />
            </div>
            <div className={ui["card-hint"]}>{total} közös meccs · győzelem – döntetlen – győzelem</div>
          </div>
        );
      })}
    </section>
  );
}

function FormTab({ data }: { data: StatsView }) {
  const everyone: RankedPlayer[] = [...data.leaderboard.ranked, ...data.leaderboard.unranked].sort(
    (a, b) => b.currentWinStreak - a.currentWinStreak || b.bestWinStreak - a.bestWinStreak || b.wins - a.wins,
  );
  const hot = everyone.filter((p) => p.currentWinStreak >= 2);
  return (
    <>
      {hot.length > 0 && (
        <section className={`${ui.card} ${styles.hot}`}>
          <h2>🔥 Sorozatban</h2>
          <p>
            {hot.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ", "}
                <strong>{p.username}</strong> {p.currentWinStreak} győzelem egymás után
              </span>
            ))}
          </p>
        </section>
      )}
      <section className={ui.card}>
        <div className={ui["card-hdr"]}>
          <h2>Forma</h2>
          <span className={ui["card-hint"]}>utolsó 5 meccs: GY győzelem · V utolsó hely</span>
        </div>
        {everyone.length === 0 && <p className={ui.empty}>Nincs adat.</p>}
        {everyone.map((p) => (
          <Link key={p.id} href={`/players/${p.id}`} className={ui["lb-row"]}>
            <Avatar id={p.id} name={p.username} />
            <div className={ui["lb-main"]}>
              <div className={ui["lb-name"]}>{p.username}</div>
              <div className={ui["lb-meta"]}>
                Most: {p.currentWinStreak} · Legjobb sorozat: {p.bestWinStreak}
              </div>
            </div>
            <FormChips form={p.form} />
          </Link>
        ))}
      </section>
    </>
  );
}
