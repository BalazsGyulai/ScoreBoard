import StatisticCard from "@/components/ui/statisticCard"
import styles from "./dashboard.module.css"
import ScoreCard from "@/components/ui/scoreCard"

export default function Dashboard() {
    return (
        <div className="view">
            <div className={styles["dash-top"]}>
                <h1>Szia, <span className={styles["orange"]}>Bali</span> 👋</h1>
                <p>47 meccs rögzítve · 7 játékos · Utoljára játszva: ma</p>
            </div>

            <div className={styles["stats4"]}>
                <StatisticCard
                    label="Győzelmi arány"
                    value="68"
                    subLabel="↑ 4% az elmúlt hónapban"
                    dark={true}
                />
                <StatisticCard
                    label="Összes meccs"
                    value="68"
                    subLabel="12 különböző játék"
                />
                <StatisticCard
                    label="Legjobb játék"
                    value="68"
                    subLabel="8/11 meccs megnyerve"
                />
                <StatisticCard
                    label="Legtöbb aktív"
                    value="68"
                    subLabel="47-ből 41 meccsen"
                />
            </div>

            <div className={styles["dash2"]}>
                <ScoreCard
                    title={"Ranglista"}
                    extraElement={<span className={styles["muted"]}>Win %</span>}
                >
                    <div className={styles["lb-row"]}>
                        <div className={styles["lb-rank"]}>1</div>
                        <div className={`${styles.avatar} ${styles.av36}"`}>s</div>
                        <div className={styles["lb-name"]}>name</div>
                        <div className={styles["lb-games-ct"]}>5 meccs</div>
                        <div className={styles["lb-bar-w"]}><div className={styles["bar-track"]}><div className={styles["bar-fill"]} style={{ width: "40%", background: "var(--orange)" }}></div></div></div>
                        <div className={styles["lb-pct"]}>43%</div>
                    </div>
                </ScoreCard>

                <ScoreCard
                    title={"Legutóbbi meccsek"}
                    extraElement={<button className="btn btn-ghost btn-sm"
                    >Mind →</button>}
                >
                    <div className={styles["rg-row"]}>
                        <div className={styles["rg-icon"]}>icon</div>
                        <div className={styles["rg-info"]}><div className={styles["rg-name"]}>name</div><div className="rg-meta">info</div></div>
                        <span className={styles["rg-winner"]}>🏆 winner</span>
                    </div>
                </ScoreCard>


            </div>

            <div className={`${styles.card} ${styles.dash3}`}>
                <div className={styles.p24}>
                    <div className={styles["section-hdr"]}>
                        <h2>Összesített táblázat</h2>
                    </div>
                    <div className={styles["ovx"]}>
                        <table className={styles["hth-table"]}>
                            <thead><tr>
                                <th>Játékos</th><th>Győzelmek</th><th>Vesztések</th><th>Meccsek</th><th>Win %</th><th>Legjobb sorozat</th><th>Trend</th>
                            </tr></thead>
                            <tbody>
                                <tr>
                                    <td><div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <div className={`${styles.avatar} ${styles.av36}`} style={{ background: "var(--slate-900)", color: "#fff", fontSize: "12px" }}>name</div>
                                        <span style={{ fontWeight: 500, fontSize: "14px" }}>name</span>
                                    </div></td>
                                    <td><span style={{ fontWeight: 600, color: "var(--success)" }}>wins</span></td>
                                    <td><span style={{ color: "var(--danger)" }}>losses</span></td>
                                    <td style={{ color: "var(--slate-500)" }}>games</td>
                                    <td><div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                        <div style={{ width: "44px", height: "5px", background: "var(--slate100)", borderRadius: "99px", overflow: "hidden" }}>
                                            <div style={{ width: "20%", height: "100%", background: "var(--orange)", borderRadius: "99px" }}></div>
                                        </div>
                                        <strong style={{ fontSize: "13px" }}>a</strong>
                                    </div></td>
                                    <td style={{ fontWeight: "600" }}>3 🔥</td>
                                    <td><div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "21px", justifyContent: "center" }}>b</div></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div >
    )
}