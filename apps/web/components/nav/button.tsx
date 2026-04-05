import styles from "./button.module.css"

export default function Button({ className, title, icon, onClick = () => {} }: {
    className?: string,
    title: string,
    icon: React.ReactElement,
    onClick?: React.MouseEventHandler<HTMLButtonElement>
}) {
    return (
        <button className={`${styles["nav-btn"]} ${className}`} title={title} onClick={onClick}>
            { icon }
        </button>
    )
}