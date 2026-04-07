"use client";

import Navigation from "@/components/nav/navigation";
import { ToastProvider } from "@/components/toast/toastProvider";
import styles from "./layout.module.css"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${styles.dottedBackround}`}>
      <ToastProvider>
        <Navigation />

        <main className={styles.page}>
          {children}
        </main>
      </ToastProvider>
    </div>
  );
}
