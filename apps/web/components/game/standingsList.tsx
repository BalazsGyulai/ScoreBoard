import { gapLabel, leaderboardRows, type Standings, type WinnerRule } from "@/lib/scoring/standings";
import styles from "./standingsList.module.css";

/**
 * Current standings of one game session: rank, player, running total, gap to the
 * leader and rounds played. Used on the game screen and in the shared live viewer.
 */
export default function StandingsList({
  standings,
  rule,
  names,
  final = false,
}: {
  standings: Standings;
  rule: WinnerRule;
  names: Map<string, string>;
  final?: boolean;
}) {
  const rows = leaderboardRows(standings, rule);
  if (rows.length === 0) return null;
  const worst = rows[rows.length - 1].place;

  return (
    <section className={styles.card} aria-labelledby="standings-title" data-testid="standings">
      <div className={styles.hdr}>
        <h2 id="standings-title">{final ? "Végeredmény" : "Jelenlegi állás"}</h2>
        <span className={styles.hint}>
          {standings.roundCount} kör · {rule === "min" ? "kevesebb pont nyer" : "több pont nyer"}
        </span>
      </div>
      <ol className={styles.list}>
        {rows.map((row) => {
          const incomplete = row.roundsPlayed < standings.roundCount;
          const cls = row.place === 1 ? styles.first : row.place === worst && worst > 1 ? styles.last : "";
          return (
            <li key={row.userId} className={`${styles.row} ${cls}`} data-testid="standings-row">
              <span className={styles.rank} aria-label={`${row.place}. hely`}>
                {row.place}
              </span>
              <span className={styles.who}>
                <span className={styles.name}>{names.get(row.userId) ?? "?"}</span>
                <span className={styles.meta}>
                  {gapLabel(row, standings.winners.length)} · {row.roundsPlayed}
                  {incomplete ? `/${standings.roundCount}` : ""} kör
                </span>
              </span>
              <span className={styles.total}>{row.total}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
