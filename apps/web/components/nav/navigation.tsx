"use client";

import Link from "next/link";
import Button from "./button";
import styles from "./navigation.module.css";
import { Settings, Plus, LayoutDashboard, Dices, ChartColumn } from "lucide-react";
import NavItem from "./navItem";
import SidebarSettins from "./sidebarSettings";
import { useState } from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { fetchJson } from "@/lib/api/client";

type MeResponse = { role: string };

// Desktop/tablet: floating pill at the top. Phone: fixed tab bar at the bottom
// (thumb reach, no horizontal overflow). See navigation.module.css.
export default function Navigation() {
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const pathname = usePathname();
  const { data: me } = useSWR<MeResponse>("/api/auth/me", fetchJson, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });
  const canManageGames = me?.role === "leader";

  const activePage = pathname.startsWith("/games")
    ? "games"
    : pathname.startsWith("/stats")
      ? "stats"
      : pathname.startsWith("/dashboard")
        ? "dashboard"
        : "";

  return (
    <>
      <nav className={styles["nav-wrap"]} data-testid="app-nav">
        <div className={styles["nav-pill"]}>
          <Button
            className={styles["nav-btn-gear"]}
            title="Beállítások"
            icon={<Settings size={16} />}
            label="Beállítás"
            onClick={() => setSettingsOpen(true)}
          />

          <div className={styles["nav-sep"]} />

          <NavItem
            title="Dashboard"
            icon={<LayoutDashboard size={18} />}
            active={activePage === "dashboard"}
            href="/dashboard"
          />
          <NavItem
            title="Játékok"
            icon={<Dices size={18} />}
            active={activePage === "games"}
            href="/games"
          />
          <NavItem
            title="Statisztika"
            icon={<ChartColumn size={18} />}
            active={activePage === "stats"}
            href="/stats"
          />

          <div className={styles["nav-sep"]} />

          {canManageGames && (
            <Link href="/games/new" className={styles["nav-btn-add"]} title="Új játék" aria-label="Új játék">
              <Plus size={16} />
            </Link>
          )}
        </div>
      </nav>

      {isSettingsOpen && (
        <SidebarSettins onClose={() => setSettingsOpen(false)} />
      )}
    </>
  );
}
