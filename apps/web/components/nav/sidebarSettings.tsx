import { LogOut, X, Eye} from "lucide-react"
import styles from "./sidebarSettings.module.css"

export default function SidebarSettins() {
    return (
        <div className={`${styles["settings-overlay"]} ${styles.open}`} id="settingsOverlay">
            <div className={styles["settings-bd"]}></div>
            <div className={styles["settings-panel"]}>
                <button className={styles["settings-close"]}>
                    <X size={13} />
                </button>
                <h2>Beállítások</h2>

                <div className={styles["s-section"]}>
                    <div className={styles["s-label"]}>Megjelenítés</div>
                    <div className={styles["s-row"]}><span className={styles["s-row-name"]}>Oszlopok száma</span>
                        <div className={styles["col-stepper"]}>
                            <button className={styles["col-step-btn"]}>−</button>
                            <span className={styles["col-step-val"]} id="colVal">3</span>
                            <button className={styles["col-step-btn"]}>+</button>
                        </div>
                    </div>
                </div>

                <div className={styles["s-section"]}>
                    <div className={styles["s-label"]}>Játékosok</div>
                    <div id="pt-rows">
                        <div className={styles["pt-row"]}>
                            <div className={`${styles.avatar} ${styles.av36}`}>name</div>
                            <div className={styles["pt-name"]}>name</div>
                            <button className={styles["pt-eye"]} title="Megjelenítés">
                                {/* <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg> */}
                                <Eye size={12} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="s-section">
                    <div className={styles["s-label"]}>Aktív játék adatai</div>
                    <div className={styles["s-row"]}><span className={styles["s-row-name"]}>Játék</span><span className={`${styles["s-row-val"]}`}>Skyjo</span></div>
                    {/* <div className={styles["s-row"]}><span className={styles["s-row-name"]}>Ponthatár</span><span className={styles["s-row-val"]}>100 pont</span></div> */}
                    <div className={styles["s-row"]}><span className={styles["s-row-name"]}>Dátum</span><span className={styles["s-row-val"]}>2026.04.05</span></div>
                    <div className={styles["s-row"]}><span className={styles["s-row-name"]}>Körök</span><span className={styles["s-row-val"]} id="s-rounds">4</span></div>
                </div>

                <div className={styles.actions}>
                    <button className={`${styles.btn} ${styles["btn-dark"]}`}>Mentés &amp; bezárás</button>
                    <button className={`${styles.btn} ${styles["btn-danger"]}`}>
                        <LogOut size={13} />
                        Kijelentkezés
                    </button>
                </div>
            </div>
        </div>
    )
}