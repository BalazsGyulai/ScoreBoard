import styles from "./navItem.module.css"

export default function NavItem({active = false, title}: {
    active?: boolean,
    title: string
}) {
    return (
        <button className={`${styles["nav-item"]} ${active && styles["active"]}`}>{title}</button>
    )
}