import { SettingsContent } from "@/components/nav/sidebarSettings";
import styles from "./settings.module.css";

// The same settings as the sheet behind the gear button, as a full page
// (bookmarkable, and more room on a phone).
export default function SettingsPage() {
  return (
    <div className="view">
      <h1 className={styles.heading}>Beállítások</h1>
      <div className={styles.card}>
        <SettingsContent />
      </div>
    </div>
  );
}
