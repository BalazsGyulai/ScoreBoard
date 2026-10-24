"use client";

import Navigation from "@/components/nav/navigation";
import AuthKeepAlive from "@/components/auth/authKeepAlive";
import { ToastProvider } from "@/components/toast/toastProvider";
import styles from "./layout.module.css"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${styles.dottedBackround}`}>
      <AuthKeepAlive />
      <ToastProvider>
        <Navigation />

        <main className={styles.page}>
          {children}
        </main>
      </ToastProvider>
    </div>
  );
}
