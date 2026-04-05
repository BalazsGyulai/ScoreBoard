"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApiPlayer } from "@/types/api";
import styles from "./game.module.css";

interface Props {
  gameId: string;
  players: ApiPlayer[];
}

export default function RoundForm({ gameId, players }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [scores, setScores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function setScore(playerId: string, value: string) {
    setScores((prev) => ({ ...prev, [playerId]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = players.map((p) => ({
      player_id: p.id,
      value: parseInt(scores[p.id] ?? "0", 10),
    }));

    startTransition(async () => {
      const res = await fetch(`/api/games/${gameId}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores: payload }),
      });

      if (res.ok) {
        setScores({});
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "Hiba történt");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className={styles.roundForm}>
      {error && <p className={styles.formError}>{error}</p>}

      <div className={styles.scoreInputs}>
        {players.map((p) => (
          <div key={p.id} className={styles.scoreRow}>
            <label htmlFor={`score-${p.id}`} className={styles.scoreLabel}>
              {p.username}
            </label>
            <input
              id={`score-${p.id}`}
              type="number"
              value={scores[p.id] ?? ""}
              onChange={(e) => setScore(p.id, e.target.value)}
              placeholder="0"
              className={styles.scoreInput}
            />
          </div>
        ))}
      </div>

      <button
        type="submit"
        className={styles.submitBtn}
        disabled={isPending}
      >
        {isPending ? "Mentés..." : "Kör rögzítése →"}
      </button>
    </form>
  );
}
