"use client";

import { apiFetch } from "@/lib/api/client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { mutate } from "swr";
import { AtSign, Shield, X } from "lucide-react";
import ActionButton from "@/components/ui/actionButton";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { handleStringChange } from "@/lib/utils";
import styles from "./accountModal.module.css";

/** Edit a player's email and/or password (leader: anyone in the group, member: self). */
export default function AccountModal({
  player,
  onClose,
}: {
  player: { id: string; username: string; email: string | null };
  onClose: () => void;
}) {
  const [accountEmail, setAccountEmail] = useState(player.email ?? "");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPassword2, setAccountPassword2] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSuccess, setAccountSuccess] = useState<string | null>(null);
  const [isUpdatingAccount, setIsUpdatingAccount] = useState(false);

  async function handleAccountUpdate() {

    const trimmedEmail = accountEmail.trim();
    const currentEmail = (player.email ?? "").trim();
    const emailChanged = trimmedEmail !== currentEmail;
    const hasPassword = accountPassword.length > 0 || accountPassword2.length > 0;
    setAccountError(null);
    setAccountSuccess(null);

    if (!emailChanged && !hasPassword) {
      setAccountError("Nincs menthető módosítás.");
      return;
    }

    if (emailChanged && !trimmedEmail) {
      setAccountError("Az email nem lehet üres.");
      return;
    }

    if (hasPassword) {
      if (accountPassword !== accountPassword2) {
        setAccountError("A jelszavak nem egyeznek.");
        return;
      }
      if (accountPassword.length < 8) {
        setAccountError("A jelszónak legalább 8 karakter hosszúnak kell lennie.");
        return;
      }
    }

    setIsUpdatingAccount(true);
    try {
      const payload: { email?: string; password?: string; password2?: string } = {};
      if (emailChanged) {
        payload.email = trimmedEmail;
      }
      if (hasPassword) {
        payload.password = accountPassword;
        payload.password2 = accountPassword2;
      }

      const res = await apiFetch(`/api/players/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message = "Mentés sikertelen";
        try {
          const data = (await res.json()) as { error?: string };
          message = data.error ?? message;
        } catch {
          // ignore parse errors
        }
        setAccountError(message);
        return;
      }

      setAccountSuccess("Fiók adatai sikeresen frissítve.");
      setAccountPassword("");
      setAccountPassword2("");
      await mutate("/api/players");
    } catch {
      setAccountError("Nem sikerült csatlakozni a szerverhez.");
    } finally {
      setIsUpdatingAccount(false);
    }
  }

  return createPortal(
          <div className={styles["modal-overlay"]}>
            <div className={styles["modal-backdrop"]} onClick={onClose} />
            <div className={styles["modal-panel"]}>
              <button className={styles["modal-close"]} onClick={onClose} aria-label="Bezárás">
                <X size={14} />
              </button>
              <h2>Fiók szerkesztése</h2>
              <p className={styles["modal-subtitle"]}>
                {player.username} adatai: email frissítés és opcionális jelszócsere.
              </p>

              <div className={styles["modal-fields"]}>
                <div className={styles["modal-static-field"]}>
                  <div className={styles["modal-static-label"]}>Felhasználónév</div>
                  <div className={styles["modal-static-value"]}>{player.username}</div>
                </div>
                <Input
                  id="account-email"
                  title="Email"
                  type="email"
                  placeholder="e.g. myemail@email.com"
                  icon={<AtSign size={16} />}
                  value={accountEmail}
                  onChange={handleStringChange(setAccountEmail)}
                />
                <Input
                  id="account-password"
                  title="Új jelszó (opcionális)"
                  type="password"
                  placeholder="Legalább 8 karakter"
                  icon={<Shield size={16} />}
                  value={accountPassword}
                  onChange={handleStringChange(setAccountPassword)}
                />
                <Input
                  id="account-password2"
                  title="Új jelszó megerősítése"
                  type="password"
                  placeholder="Legalább 8 karakter"
                  icon={<Shield size={16} />}
                  value={accountPassword2}
                  onChange={handleStringChange(setAccountPassword2)}
                />
              </div>

              {accountError && <p className={styles["modal-error"]}>{accountError}</p>}
              {accountSuccess && <p className={styles["modal-success"]}>{accountSuccess}</p>}

              <div className={styles["modal-actions"]}>
                <ActionButton text="Mégse" variant="ghost" onClick={onClose} />
                <Button text="Mentés" onClick={handleAccountUpdate} disabled={isUpdatingAccount} />
              </div>
            </div>
          </div>,
    document.body,
  );
}
