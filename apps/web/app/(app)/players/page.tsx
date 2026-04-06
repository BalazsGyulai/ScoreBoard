import Link from "next/link";
import { players, avatarColors } from "@/lib/mockData";
import styles from "./players.module.css";

export default function PlayersPage() {
  return (
    <div className="view">
      <div className={styles["page-top"]}>
        <h1>Játékosok</h1>
        <p>A csoport tagjai</p>
      </div>
      <ul className={styles.list}>
        {players.map((p, i) => {
          const pct = Math.round((p.wins / p.games) * 100);
          return (
            <li key={p.id}>
              <Link href={`/players/${i}`} className={styles.row}>
                <div
                  className={styles.avatar}
                  style={{
                    background: avatarColors[i],
                    color: "#fff",
                  }}
                >
                  {p.name[0]}
                </div>
                <div className={styles.info}>
                  <div className={styles.name}>{p.name}</div>
                  <div className={styles.meta}>
                    {p.id} · {p.games} meccs · {pct}% win
                  </div>
                </div>
                <span className={styles.arrow}>→</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
