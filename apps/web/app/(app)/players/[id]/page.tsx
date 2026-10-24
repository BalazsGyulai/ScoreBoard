"use client";

import { fetchJson } from "@/lib/api/client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import StatisticCard from "@/components/ui/statisticCard";
import ActionButton from "@/components/ui/actionButton";
import AccountModal from "@/components/players/accountModal";
import { Avatar, FormChips, YearFilter, statsStyles as ui } from "@/components/stats/ui";
import { daysAgoLabel } from "@/lib/stats/time";
import type { PlayerView } from "@/lib/stats/views";
import type { ApiPlayer } from "@/types/api";
import styles from "./player.module.css";

type MeResponse = { user_id: string; role: string };

function duelColor(score: number) {
  if (score >= 60) return "var(--success)";
  if (score >= 40) return "var(--orange)";
  return "var(--danger)";
}

export default function PlayerPage() {
  const params = useParams<{ id: string }>();
  const playerId = String(params.id ?? "");
  const [year, setYear] = useState<number | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  const { data, error } = useSWR<PlayerView>(
    `/api/dashboard/player/${encodeURIComponent(playerId)}?year=${year ?? "overall"}`,
    fetchJson,
    { keepPreviousData: true },
  );
  const { data: me } = useSWR<MeResponse>("/api/auth/me", fetchJson);
  const { data: players } = useSWR<ApiPlayer[]>("/api/players", fetchJson);

  if (error && !data) {
    return (
      <div className="view">
        <Link href="/stats" className={styles.back}>
          ← Statisztika
        </Link>
        <h1>Nincs ilyen játékos</h1>
        <p className={ui.empty}>{(error as Error).message}</p>
      </div>
    );
  }

  const s = data?.stats;
  const account = players?.find((p) => p.id === playerId);
  const canEditAccount = !!me && !!account && (me.role === "leader" || me.user_id === playerId);
  const actMax = Math.max(1, ...(data?.activity.map((a) => a.count) ?? [0]));

  return (
    <div className="view">
      {/* ── Header ── */}
      <div className={styles["player-hdr"]}>
        {s ? <Avatar id={s.id} name={s.username} /> : <div className={ui.avatar} />}
        <div className={styles["player-hdr-info"]}>
          <h1>{s?.username ?? "Betöltés..."}</h1>
          <div className={styles["player-sub"]}>
            {s
              ? s.matches > 0
                ? `${s.rank ? `${s.rank}. hely a ranglistán` : `Nincs rangsorolva (kevesebb mint ${data!.minMatches} meccs)`} · utoljára ${daysAgoLabel(s.lastPlayedAt)}`
                : "Ebben az időszakban nem játszott"
              : ""}
          </div>
          {s && <FormChips form={s.form} />}
        </div>
      </div>

      <div className={styles["player-nav"]}>
        <div className={styles["player-switch"]}>
          {data?.prevId && (
            <Link className={styles["nav-link"]} href={`/players/${data.prevId}`}>
              ← Előző játékos
            </Link>
          )}
          {data?.nextId && (
            <Link className={styles["nav-link"]} href={`/players/${data.nextId}`}>
              Következő →
            </Link>
          )}
        </div>
        <YearFilter years={data?.years ?? []} value={year} onChange={setYear} />
        {canEditAccount && <ActionButton text="Fiók szerkesztése" variant="ghost" onClick={() => setAccountOpen(true)} />}
      </div>

      {/* ── 4 stat cards ── */}
      <div className={styles.pstats4}>
        <StatisticCard label="Győzelmi arány" value={s ? `${s.winRate}%` : "…"} subLabel={s ? `${s.wins} / ${s.matches} meccs` : ""} dark />
        <StatisticCard label="Győzelmek" value={s ? String(s.wins) : "…"} subLabel={s ? `${s.matches} meccsből` : ""} />
        <StatisticCard label="Utolsó helyek" value={s ? String(s.losses) : "…"} subLabel={s ? `${s.matches} meccsből` : ""} />
        <StatisticCard
          label="Legjobb sorozat"
          value={s ? `${s.bestWinStreak} 🔥` : "…"}
          subLabel={s ? (s.currentWinStreak > 0 ? `most is ${s.currentWinStreak} győzelem egymás után` : "egymás utáni győzelem") : ""}
        />
      </div>

      <div className={styles.pdash2}>
        {/* Left: per game */}
        <section className={ui.card}>
          <div className={ui["card-hdr"]}>
            <h2>Játékonként</h2>
            <span className={ui["card-hint"]}>
              {data?.bestGame?.qualified ? `legjobb: ${data.bestGame.icon} ${data.bestGame.name}` : ""}
            </span>
          </div>
          {data && data.bests.length === 0 && <p className={ui.empty}>Nincs lezárt meccs.</p>}
          {data?.bests.map((g) => (
            <div className={styles["pgi-row"]} key={g.gameId}>
              <div className={styles["pgi-name"]}>
                <span style={{ fontSize: 18 }}>{g.icon}</span>
                <span>
                  {g.name}
                  <span className={styles["pgi-sub"]}>
                    {g.matches} meccs · legjobb végeredmény {g.bestTotal ?? "–"} · legjobb kör {g.bestRound ?? "–"}
                  </span>
                </span>
              </div>
              <div className={styles["pgi-stats"]}>
                <div className={styles["pgi-stat"]}>
                  <div className={`${styles.v} ${styles.green}`}>{g.wins}</div>
                  <div className={styles.l}>Győz</div>
                </div>
                <div className={styles["pgi-stat"]}>
                  <div className={`${styles.v} ${styles.red}`}>{g.losses}</div>
                  <div className={styles.l}>Utolsó</div>
                </div>
                <div className={styles["pgi-stat"]}>
                  <div className={styles.v}>{g.winRate}%</div>
                  <div className={styles.l}>Win%</div>
                </div>
              </div>
            </div>
          ))}
        </section>

        <div>
          {/* Activity */}
          <section className={ui.card}>
            <div className={ui["card-hdr"]}>
              <h2>Havi aktivitás</h2>
              <span className={ui["card-hint"]}>meccsek</span>
            </div>
            <div className={styles["act-bars"]}>
              {data?.activity.map((a) => (
                <div className={styles["act-bar-wrap"]} key={a.key}>
                  <div className={styles["act-val"]}>{a.count || ""}</div>
                  <div className={styles["act-bar-inner"]}>
                    <div className={styles["act-bar"]} style={{ height: Math.max(4, (a.count / actMax) * 84) }} />
                  </div>
                </div>
              ))}
            </div>
            <div className={styles["act-labels"]}>
              {data?.activity.map((a) => (
                <span className={styles["act-label"]} key={a.key}>
                  {a.label}
                </span>
              ))}
            </div>
          </section>

          {/* Head to head */}
          <section className={ui.card}>
            <div className={ui["card-hdr"]}>
              <h2>Egymás ellen</h2>
              <span className={ui["card-hint"]}>győzelem – döntetlen – vereség</span>
            </div>
            {data && data.headToHead.length === 0 && <p className={ui.empty}>Még nincs közös meccs.</p>}
            {data?.headToHead.map((d) => (
              <Link key={d.opponentId} href={`/players/${d.opponentId}`} className={ui["lb-row"]}>
                <Avatar id={d.opponentId} name={d.opponent} />
                <div className={ui["lb-main"]}>
                  <div className={ui["lb-name"]}>{d.opponent} ellen</div>
                  <div className={ui["lb-meta"]}>
                    {d.wins} – {d.draws} – {d.losses} · {d.played} közös meccs
                  </div>
                  <div className={ui["bar-track"]}>
                    <div className={ui["bar-fill"]} style={{ width: `${d.score}%`, background: duelColor(d.score) }} />
                  </div>
                </div>
                <div className={ui["lb-pct"]} style={{ color: duelColor(d.score) }}>
                  {d.score}%
                </div>
              </Link>
            ))}
          </section>
        </div>
      </div>

      {accountOpen && account && <AccountModal player={account} onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
