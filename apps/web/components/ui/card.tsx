import { ChessRook } from "lucide-react";
import styles from "./card.module.css"

export default function Card({children, heading, subHeading}: {
    heading?: string,
    subHeading?: React.ReactNode,
    children?: React.ReactNode,
}) {
    return (
        <div className={styles.card}>

            <div className={styles.brand}>
                <div className={styles["brand-icon"]}>
                    <ChessRook size={16} className={styles["brand-icon-color"]} />
                </div>
                <span className={styles["brand-name"]}>ScoreBoard</span>
            </div>

            {heading && <h1 className={styles.heading}>{heading}</h1>}
            {subHeading && <p className={styles.subheading}>{subHeading}</p>}
            
            <div className={styles.divider}></div>

            {children && children}

        </div>
    )
}