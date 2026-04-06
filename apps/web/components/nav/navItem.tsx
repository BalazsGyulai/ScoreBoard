import type { Route } from "next"
import Link from "next/link"
import styles from "./navItem.module.css"

export default function NavItem({active = false, title, href = "/"}: {
    active?: boolean,
    title: string,
    href?: Route,
}) {
    return (
        <Link href={href} className={`${styles["nav-item"]} ${active ? styles["active"] : ""}`}>{title}</Link>
    )
}