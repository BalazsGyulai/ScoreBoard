import type { Route } from "next"
import Link from "next/link"
import styles from "./navItem.module.css"

export default function NavItem({active = false, title, href = "/", icon}: {
    active?: boolean,
    title: string,
    href?: Route,
    icon?: React.ReactNode,
}) {
    return (
        <Link href={href} className={`${styles["nav-item"]} ${active ? styles["active"] : ""}`} aria-current={active ? "page" : undefined}>
            {icon && <span className={styles["nav-icon"]} aria-hidden="true">{icon}</span>}
            <span className={styles["nav-label"]}>{title}</span>
        </Link>
    )
}
