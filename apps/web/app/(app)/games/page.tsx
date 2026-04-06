import styles from "./games.module.css"

export default function Games() {
    return (
        <div className={styles.view}>
            <div className={styles["dash-top"]}>
                <h1>Játékok</h1>
                <p>Válassz egy meccset, vagy indíts újat a + gombbal</p>
            </div>
            <div className={styles["games-grid"]}>
                <div className={`${styles.card} ${styles["game-card"]}`}>
                    <div className={styles["game-card-icon"]}>Icon</div>
                    <h3>name</h3>
                    <div className={styles["gc-meta"]}>3 meccs · Utoljára: Bali nyert</div>
                    <span className={`${styles.badge} ${styles['badge-green']}"`}>✓ Lezárt</span>
                </div>
            </div>
        </div>
    )
}