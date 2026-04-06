import styles from "./statisticCard.module.css"

export default function StatisticCard({dark = false, label, value, subLabel}: {
    dark?: boolean,
    label?: string,
    value?: string,
    subLabel?: string
}) {
    return (
        <div className={`${styles.card} ${styles["stat-card"]} ${dark && styles.dark}`}>
            {label && <div className={styles["stat-label"]}>{label}</div>}
            {value && <div className={styles["stat-value"]}>{value}</div>}
            {subLabel && <div className={styles["stat-sub"]}>{subLabel}</div>}
        </div>
    )
}