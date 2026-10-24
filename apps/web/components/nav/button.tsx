import styles from "./button.module.css"

export default function Button({ className, title, icon, label, onClick = () => {} }: {
    className?: string,
    title: string,
    icon: React.ReactElement,
    /** Short caption shown under the icon in the phone tab bar. */
    label?: string,
    onClick?: React.MouseEventHandler<HTMLButtonElement>
}) {
    return (
        <button className={`${styles["nav-btn"]} ${className}`} title={title} aria-label={title} onClick={onClick}>
            { icon }
            {label && <span className={styles["nav-btn-label"]}>{label}</span>}
        </button>
    )
}
