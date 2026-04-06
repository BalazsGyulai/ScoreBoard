import Link from "next/link";
import { gamesList } from "@/lib/mockData";
import styles from "./games.module.css";

export default function Games() {
  return (
    <div className="view">
      <div className={styles["dash-top"]}>
        <h1>Játékok</h1>
        <p>Válassz egy meccset, vagy indíts újat a + gombbal</p>
      </div>
      <div className={styles["games-grid"]}>
        {gamesList.map((g) => (
          <Link
            href={`/games/${encodeURIComponent(g.name.toLowerCase())}`}
            key={g.name}
            className={`${styles.card} ${styles["game-card"]} ${g.status === "active" ? styles["active-game"] : ""}`}
          >
            <div className={styles["game-card-icon"]}>{g.icon}</div>
            <h3>{g.name}</h3>
            <div className={styles["gc-meta"]}>
              {g.sessions} meccs · Utoljára: {g.lastWinner} nyert
            </div>
            <span
              className={`${styles.badge} ${g.status === "active" ? styles["badge-amber"] : styles["badge-green"]}`}
            >
              {g.status === "active" ? "● Aktív" : "✓ Lezárt"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
