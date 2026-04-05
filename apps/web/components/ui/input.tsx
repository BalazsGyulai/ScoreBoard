import type { ReactElement } from "react"
import styles from "./input.module.css"

export default function Input({ id, title, placeholder, icon, type, autoComplete }: {
    id: string,
    type: string,
    title: string,
    placeholder: string,
    icon?: ReactElement<any, any>,
    autoComplete?: string,
}) {
    return (
        <div className={styles.field}>
            <label className={styles.label} htmlFor={id}>{title}</label>
            <div className={styles["input-wrap"]}>
                {icon && <span className={styles.icon}>{icon}</span>}

                <input
                    className={styles.input}
                    type={type}
                    id={id}
                    placeholder={placeholder}
                    {...(autoComplete && { autoComplete })}
                />
            </div>
        </div>
    );
}