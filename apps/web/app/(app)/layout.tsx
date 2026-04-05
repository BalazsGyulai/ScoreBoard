import Navigation from "@/components/nav/navigation";
import styles from "./layout.module.css"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${styles.dottedBackround}`}>

      <Navigation />

      <main className="appContent">
        {children}
      </main>
    </div>
  );
}
