import styles from "./button.module.css"

export default function Button({ className, title, icon }: {
    className?: string,
    title: string,
    icon: React.ReactElement
}) {
    return (
        <button className={`${styles["nav-btn"]} ${className}`} title={title}>
            { icon }
        </button>
    )
}