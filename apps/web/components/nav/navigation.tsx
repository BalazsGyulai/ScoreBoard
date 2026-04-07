"use client";

import Link from "next/link";
import Button from "./button";
import styles from "./navigation.module.css";
import { Settings, Plus } from "lucide-react";
import NavItem from "./navItem";
import SidebarSettins from "./sidebarSettings";
import { useState } from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";

type MeResponse = { role: string };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Hiba (${res.status})`);
  }
  return res.json() as Promise<T>;
}

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
      <nav className={styles["nav-wrap"]}>
        <div className={styles["nav-pill"]}>
          <Button
            className={styles["nav-btn-gear"]}
            title="Beállítások"
            icon={<Settings size={14} />}
            onClick={() => setSettingsOpen(true)}
          />

          <div className={styles["nav-sep"]} />

          <NavItem
            title="Dashboard"
            active={activePage === "dashboard"}
            href="/dashboard"
          />
          <NavItem
            title="Játékok"
            active={activePage === "games"}
            href="/games"
          />
          <NavItem
            title="Statisztika"
            active={activePage === "stats"}
            href="/stats"
          />

          <div className={styles["nav-sep"]} />

          {canManageGames && (
            <Link href="/games/new" className={styles["nav-btn-add"]} title="Új játék">
              <Plus size={15} />
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
