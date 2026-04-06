"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  Settings,
  Trash2,
  Check,
  Plus,
} from "lucide-react";
import ActionButton from "@/components/ui/actionButton";
import { skyjoPlayers, players, initialRounds } from "@/lib/mockData";
import styles from "./game.module.css";

export default function ActiveGamePage() {
  const [rounds, setRounds] = useState<(number | null)[][]>(
    () => initialRounds.map((r) => [...r]),
  );
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const totals = skyjoPlayers.map((_, pi) =>
    rounds.reduce((s, r) => s + (r[pi] ?? 0), 0),
  );
  const validTotals = totals.filter(
    (t, i) => skyjoPlayers[i] !== "Papa" && t > 0,
  );
  const minTotal = validTotals.length ? Math.min(...validTotals) : 0;
  const maxTotal = Math.max(...totals);

  function commitRound() {
    const vals = skyjoPlayers.map((_, i) => {
      const el = document.getElementById(`inp${i}`) as HTMLInputElement | null;
      const v = el ? parseInt(el.value) : NaN;
      return isNaN(v) ? null : v;
    });
    if (vals.every((v) => v === null)) {
      alert("Adj meg legalább egy pontszámot!");
      return;
    }
    setRounds((prev) => [...prev, vals]);
    clearInputRow();
  }

  function clearInputRow() {
    skyjoPlayers.forEach((_, i) => {
      const el = document.getElementById(`inp${i}`) as HTMLInputElement | null;
      if (el) el.value = "";
    });
  }

  function deleteRound(ri: number) {
    if (confirm(`Törlöd a ${ri + 1}. kört?`)) {
      setRounds((prev) => prev.filter((_, i) => i !== ri));
    }
  }

  function startEdit(row: number, col: number) {
    setEditingCell({ row, col });
    setTimeout(() => editRef.current?.select(), 0);
  }

  function saveEdit() {
    if (!editingCell) return;
    const v = parseInt(editRef.current?.value ?? "");
    if (!isNaN(v)) {
      setRounds((prev) => {
        const next = prev.map((r) => [...r]);
        next[editingCell.row][editingCell.col] = v;
        return next;
      });
    }
    setEditingCell(null);
  }

  function finishGame() {
    const validIdx = totals
      .map((t, i) => ({ t, name: skyjoPlayers[i] }))
      .filter((x) => x.name !== "Papa");
    const winner = validIdx.reduce((a, b) => (a.t < b.t ? a : b));
    if (
      confirm(
        `🏆 Meccs lezárása?\nNyertes: ${winner.name} (${winner.t} pont)\n\nMenti és lezárja a meccset.`,
      )
    ) {
      // TODO: API call
    }
  }

  return (
    <div className="view">
      {/* ── Header ── */}
      <div className={styles["game-pg-hdr"]}>
        <div className={styles["game-pg-hdr-left"]}>
          <Link href="/games" className={styles.back}>
            ← Vissza a játékokhoz
          </Link>
          <h1>
            Skyjo <span className={styles.orange}>#4</span>
          </h1>
          <div className={styles["game-pg-sub"]}>
            7 játékos · Folyamatban · 2026.04.05 &nbsp;·&nbsp;{" "}
            <span className={styles.orange} style={{ fontWeight: 500 }}>
              🏆 Vezet: Atis (41 pont)
            </span>
          </div>
        </div>
        <div className={styles["game-actions"]}>
          <ActionButton
            text="Beállítások"
            variant="ghost"
            icon={<Settings size={13} />}
          />
          <ActionButton
            text="Töröl"
            variant="danger"
            icon={<Trash2 size={13} />}
          />
          <ActionButton
            text="Meccs lezárása"
            variant="amber"
            icon={<Check size={13} />}
            onClick={finishGame}
          />
        </div>
      </div>

      {/* ── Score table ── */}
      <div className={styles["scroll-hint"]}>
        <div className={styles["tbl-wrap"]}>
          <table className={styles["score-tbl"]}>
            <thead>
              <tr>
                <th className={styles["col-round"]}>Kör</th>
                {skyjoPlayers.map((name, i) => (
                  <th key={name}>
                    <span className={styles.pid}>{players[i]?.id ?? ""}</span>
                    {name}
                  </th>
                ))}
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {/* Total row */}
              <tr className={styles["total-row"]}>
                <td>Összesen</td>
                {totals.map((t, i) => {
                  const isWinner =
                    t === minTotal && t > 0 && skyjoPlayers[i] !== "Papa";
                  const isLoser = t === maxTotal;
                  const cls = isWinner
                    ? styles["winner-col"]
                    : isLoser
                      ? styles["loser-col"]
                      : "";
                  return (
                    <td key={i} className={cls}>
                      {t}
                      {isWinner ? " 🏆" : ""}
                    </td>
                  );
                })}
                <td />
              </tr>

              {/* Input row */}
              <tr className={styles["input-row"]}>
                <td>Új kör</td>
                {skyjoPlayers.map((_, i) => (
                  <td key={i}>
                    <input
                      className={styles["round-inp"]}
                      type="number"
                      id={`inp${i}`}
                      placeholder="—"
                      min={0}
                    />
                  </td>
                ))}
                <td />
              </tr>

              {/* Data rows */}
              {rounds.map((row, ri) => (
                <tr key={ri}>
                  <td>{ri + 1}. kör</td>
                  {row.map((val, pi) => (
                    <td key={pi}>
                      {val !== null ? (
                        editingCell?.row === ri &&
                        editingCell?.col === pi ? (
                          <input
                            ref={editRef}
                            className={styles["cell-edit"]}
                            type="number"
                            defaultValue={val}
                            onBlur={saveEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit();
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          <span
                            className={styles["cell-val"]}
                            onClick={() => startEdit(ri, pi)}
                          >
                            {val}
                          </span>
                        )
                      ) : (
                        <span style={{ color: "var(--slate-200)" }}>—</span>
                      )}
                    </td>
                  ))}
                  <td>
                    <button
                      className={styles["del-btn"]}
                      onClick={() => deleteRound(ri)}
                      title="Töröl"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer */}
          <div className={styles["tbl-foot"]}>
            <span className={styles["tbl-foot-info"]}>
              <strong>{rounds.length}</strong> kör lejátszva
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <ActionButton
                text="Mégse"
                variant="ghost"
                onClick={clearInputRow}
              />
              <ActionButton
                text="Kör mentése"
                variant="dark"
                icon={<Plus size={13} />}
                onClick={commitRound}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
