import styles from "./navItem.module.css"

export default function NavItem({active = false, title, onClick = () => {}}: {
    active?: boolean,
    title: string,
    onClick?: React.MouseEventHandler
}) {
    return (
        <button className={`${styles["nav-item"]} ${active && styles["active"]}`} onClick={onClick}>{title}</button>
    )
}