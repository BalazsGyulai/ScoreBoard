import Button from "./button"
import styles from "./navigation.module.css"
import { Settings, Plus } from "lucide-react"
import NavItem from "./navItem"
import SidebarSettins from "./sidebarSettings"

export default function Navigation() {
    return (
        <>
            <nav className={styles["nav-wrap"]}>
                <div className={styles["nav-pill"]}>
                    <Button
                        className={styles["nav-btn-gear"]}
                        title="Beállítások"
                        icon={<Settings size={14} />}
                    />

                    <div className={styles["nav-sep"]}></div>

                    <NavItem title="Dashboard" active={true} />
                    <NavItem title="Játékok" />
                    <NavItem title="Statisztika" />

                    <div className={styles["nav-sep"]}></div>

                    <Button
                        className={styles["nav-btn-add"]}
                        title="Új játék"
                        icon={<Plus size={15} />}
                    />
                </div>
            </nav>

            <SidebarSettins />
        </>
    )
}