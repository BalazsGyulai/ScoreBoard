"use client";

import { useState } from "react";
import { LogOut, X, Eye } from "lucide-react";
import { players, avatarColors } from "@/lib/mockData";
import styles from "./sidebarSettings.module.css";

export default function SidebarSettins({
  onClose = () => {},
}: {
  onClose?: React.MouseEventHandler<HTMLElement>;
}) {
  const [visibility, setVisibility] = useState<boolean[]>(
    players.map(() => true),
  );
  const [colVal, setColVal] = useState(3);

  function togglePlayer(idx: number) {
    setVisibility((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
  }

  function adjCols(d: number) {
    setColVal((v) => Math.max(1, Math.min(7, v + d)));
  }

  return (
    <div
      className={`${styles["settings-overlay"]} ${styles.open}`}
    >
      <div className={styles["settings-bd"]} onClick={onClose} />
      <div className={styles["settings-panel"]}>
        <button className={styles["settings-close"]} onClick={onClose}>
          <X size={13} />
        </button>
        <h2>Beállítások</h2>

        {/* ── Display settings ── */}
        <div className={styles["s-section"]}>
          <div className={styles["s-label"]}>Megjelenítés</div>
          <div className={styles["s-row"]}>
            <span className={styles["s-row-name"]}>Oszlopok száma</span>
            <div className={styles["col-stepper"]}>
              <button
                className={styles["col-step-btn"]}
                onClick={() => adjCols(-1)}
              >
                −
              </button>
              <span className={styles["col-step-val"]}>{colVal}</span>
              <button
                className={styles["col-step-btn"]}
                onClick={() => adjCols(1)}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* ── Players ── */}
        <div className={styles["s-section"]}>
          <div className={styles["s-label"]}>Játékosok</div>
          {players.map((p, i) => (
            <div className={styles["pt-row"]} key={p.id}>
              <div
                className={`${styles.avatar} ${styles.av36}`}
                style={{
                  background: avatarColors[i],
                  color: "#fff",
                }}
              >
                {p.name[0]}
              </div>
              <div className={styles["pt-name"]}>{p.name}</div>
              <button
                className={`${styles["pt-eye"]} ${visibility[i] ? styles.on : ""}`}
                title="Megjelenítés"
                onClick={() => togglePlayer(i)}
              >
                <Eye size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* ── Active game info ── */}
        <div className={styles["s-section"]}>
          <div className={styles["s-label"]}>Aktív játék adatai</div>
          <div className={styles["s-row"]}>
            <span className={styles["s-row-name"]}>Játék</span>
            <span className={`${styles["s-row-val"]} ${styles.orange}`}>
              Skyjo
            </span>
          </div>
          <div className={styles["s-row"]}>
            <span className={styles["s-row-name"]}>Ponthatár</span>
            <span className={styles["s-row-val"]}>100 pont</span>
          </div>
          <div className={styles["s-row"]}>
            <span className={styles["s-row-name"]}>Dátum</span>
            <span className={styles["s-row-val"]}>2026.04.05</span>
          </div>
          <div className={styles["s-row"]}>
            <span className={styles["s-row-name"]}>Körök</span>
            <span className={styles["s-row-val"]}>4</span>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className={styles.actions}>
          <button
            className={`${styles.btn} ${styles["btn-dark"]}`}
            onClick={onClose}
          >
            Mentés &amp; bezárás
          </button>
          <button className={`${styles.btn} ${styles["btn-danger"]}`}>
            <LogOut size={13} />
            Kijelentkezés
          </button>
        </div>
      </div>
    </div>
  );
}
