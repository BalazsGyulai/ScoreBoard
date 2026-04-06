"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./players.module.css";

export default function AddPlayerForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setUsername("");
    setEmail("");
    setPassword("");
    setError(null);
    setOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, email, password }),
      });

      if (res.ok) {
        reset();
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "Hiba történt");
      }
    });
  }

  if (!open) {
    return (
      <button className={styles.addBtn} onClick={() => setOpen(true)}>
        + Játékos hozzáadása
      </button>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2 className={styles.formHeading}>Új játékos</h2>

      {error && <p className={styles.formError}>{error}</p>}

      <div className={styles.field}>
        <label>Felhasználónév</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          placeholder="pl. Kovács Péter"
        />
      </div>

      <div className={styles.field}>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="peter@example.com"
        />
      </div>

      <div className={styles.field}>
        <label>Jelszó</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Ideiglenes jelszó"
        />
      </div>

      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryBtn} disabled={isPending}>
          {isPending ? "Mentés..." : "Hozzáadás"}
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={reset}>
          Mégse
        </button>
      </div>
    </form>
  );
}
