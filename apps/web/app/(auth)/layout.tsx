import styles from "./layout.module.css"

export default function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className={styles.dottedBackround}>
            {children}
        </div>
    );
}