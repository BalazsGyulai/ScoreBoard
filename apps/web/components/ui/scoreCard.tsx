import styles from "./scoreCard.module.css"

export default function ScoreCard({ title, extraElement, children }: {
    title: string,
    extraElement?: React.ReactNode,
    children?: React.ReactNode
}) {
    return (
        <div className={styles["card"]}>
            <div className={styles["lb-wrap"]}>
                <div className={styles["section-hdr"]}>
                    <h2>{title}</h2>
                    {extraElement && extraElement}
                </div>
                <div>
                    {children && children}
                </div>
            </div>
        </div>
    )
}