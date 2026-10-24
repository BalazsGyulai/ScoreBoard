"use client";

import Link from "next/link";
import type { Outcome } from "@/lib/stats/matches";
import type { LeaderboardView, RankedPlayer } from "@/lib/stats/views";
import styles from "./statsUi.module.css";

const palette = ["#0F172A", "#F97316", "#7C3AED", "#0EA5E9", "#16A34A", "#EF4444", "#334155"];

export function avatarColor(seed: string) {
  const hash = [...seed].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

export function Avatar({ id, name }: { id: string; name: string }) {
  return (
    <div className={styles.avatar} style={{ background: avatarColor(id) }} aria-hidden="true">
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

const outcomeLabel: Record<Outcome, string> = { W: "győzelem", L: "utolsó hely", D: "középen végzett" };
const outcomeShort: Record<Outcome, string> = { W: "GY", L: "V", D: "–" };

/** Last results as chips: GY (win) / V (last place) / – (in between). */
export function FormChips({ form }: { form: Outcome[] }) {
  if (form.length === 0) return null;
  return (
    <span className={styles.form} aria-label={`Utolsó meccsek: ${form.map((o) => outcomeLabel[o]).join(", ")}`}>
      {form.map((o, i) => (
        <span key={i} className={`${styles.chip} ${styles[`chip-${o}`]}`} aria-hidden="true">
          {outcomeShort[o]}
        </span>
      ))}
    </span>
  );
}

/** Year selector: "Összes év" + years with matches; ← = older, → = newer. */
export function YearFilter({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: number | null;
  onChange: (year: number | null) => void;
}) {
  // options from newest to oldest: overall, 2026, 2025, ...
  const options: (number | null)[] = [null, ...years];
  const index = Math.max(0, options.indexOf(value));
  return (
    <div className={styles.year}>
      <button
        type="button"
        className={styles["year-btn"]}
        onClick={() => onChange(options[index + 1] ?? null)}
        disabled={index >= options.length - 1}
        aria-label="Korábbi év"
      >
        ←
      </button>
      <select
        className={styles["year-select"]}
        value={value === null ? "overall" : String(value)}
        onChange={(e) => onChange(e.target.value === "overall" ? null : Number(e.target.value))}
        aria-label="Év"
      >
        <option value="overall">Összes év</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={styles["year-btn"]}
        onClick={() => onChange(options[index - 1] ?? null)}
        disabled={index <= 0}
        aria-label="Későbbi év"
      >
        →
      </button>
    </div>
  );
}

function LeaderboardRow({ p }: { p: RankedPlayer }) {
  const rankClass = p.rank === 1 ? styles.r1 : p.rank === 2 ? styles.r2 : p.rank === 3 ? styles.r3 : "";
  return (
    <Link href={`/players/${p.id}`} className={styles["lb-row"]}>
      <div className={`${styles["lb-rank"]} ${rankClass}`}>{p.rank ?? "–"}</div>
      <Avatar id={p.id} name={p.username} />
      <div className={styles["lb-main"]}>
        <div className={styles["lb-name"]}>{p.username}</div>
        <div className={styles["lb-meta"]}>
          {p.wins} győzelem · {p.matches} meccs
        </div>
        <div className={styles["bar-track"]}>
          <div className={styles["bar-fill"]} style={{ width: `${p.winRate}%` }} />
        </div>
      </div>
      <div className={styles["lb-pct"]}>{p.winRate}%</div>
    </Link>
  );
}

/** Ranked players, then players below the minimum number of matches. */
export function Leaderboard({ board, limit }: { board: LeaderboardView; limit?: number }) {
  const ranked = limit ? board.ranked.slice(0, limit) : board.ranked;
  if (board.ranked.length === 0 && board.unranked.length === 0) {
    return <p className={styles.empty}>Még nincs lezárt meccs ebben az időszakban.</p>;
  }
  return (
    <div data-testid="leaderboard">
      {ranked.map((p) => (
        <LeaderboardRow key={p.id} p={p} />
      ))}
      {!limit && board.unranked.length > 0 && (
        <div className={styles.unranked}>
          <div className={styles["sub-hdr"]}>Kevés meccs (kevesebb mint {board.minMatches}) — nincs rangsorolva</div>
          {board.unranked.map((p) => (
            <LeaderboardRow key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

export { styles as statsStyles };
