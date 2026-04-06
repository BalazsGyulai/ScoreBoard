'use client';

import Button from "./button"
import styles from "./navigation.module.css"
import { Settings, Plus } from "lucide-react"
import NavItem from "./navItem"
import SidebarSettins from "./sidebarSettings"
import { useState } from "react";

export default function Navigation() {
    const [isSettingsOpen, setSettingsOpen] = useState(false);
    const [activePage, setActivePage] = useState("dashboard")

    return (
        <>
            <nav className={styles["nav-wrap"]}>
                <div className={styles["nav-pill"]}>
                    <Button
                        className={styles["nav-btn-gear"]}
                        title="Beállítások"
                        icon={<Settings size={14} />}
                        onClick={() => setSettingsOpen(true)}
                    />

                    <div className={styles["nav-sep"]}></div>

                    <NavItem title="Dashboard" active={activePage === "dashboard"} href="/dashboard" />
                    <NavItem title="Játékok" active={activePage === "games"} href="/games" />
                    <NavItem title="Statisztika" active={activePage === "statistics"} href="/"/>

                    <div className={styles["nav-sep"]}></div>

                    <Button
                        className={styles["nav-btn-add"]}
                        title="Új játék"
                        icon={<Plus size={15} />}
                    />
                </div>
            </nav>

            {isSettingsOpen && <SidebarSettins onClose={() => setSettingsOpen(false)} />}
        </>
    )
}