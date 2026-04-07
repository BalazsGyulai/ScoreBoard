"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR, { mutate } from "swr";
import { AtSign, Shield, X } from "lucide-react";
import { createPortal } from "react-dom";
import StatisticCard from "@/components/ui/statisticCard";
import ActionButton from "@/components/ui/actionButton";
import Input from "@/components/ui/input";
import Button from "@/components/ui/button";
import { handleStringChange } from "@/lib/utils";
import type { ApiGame, ApiPlayer } from "@/types/api";
import styles from "./player.module.css";

type LeaderboardRow = {
  id: string;
  username: string;
  wins: number;
  losses: number;
  total_rounds: number;
  win_rate: number;
};

type SummaryTableRow = LeaderboardRow & {
  streak: number;
  trend: number[];
};

type ApiPlacement = {
  snapshot_id: string;
  game_id: string;
  user_id: string;
  place: number;
  closed_at: string;
};

type RivalRow = {
  name: string;
  pct: number;
  color: string;
};

type GameBreakdownRow = {
  name: string;
  icon: string;
  wins: number;
  losses: number;
  games: number;
};

type PlayerDerivedData = {
  gameBreakdown: GameBreakdownRow[];
  activityData: number[];
  activityLabels: string[];
  rivals: RivalRow[];
  bestGameName: string;
};

type MeResponse = {
  user_id: string;
  role: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Hiba (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      message = data.error ?? message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

function avatarColor(seed: string) {
  const palette = ["#0F172A", "#475569", "#B45309", "#94A3B8", "#CBD5E1", "#E2E8F0", "#F1F5F9"];
  const hash = [...seed].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("hu-HU", { month: "short" });
}

function monthLabelFromIndex(month: number) {
  return new Date(2026, month, 1).toLocaleDateString("hu-HU", { month: "short" });
}

function rivalColor(pct: number) {
  if (pct >= 60) return "var(--success)";
  if (pct >= 40) return "var(--orange)";
  return "var(--danger)";
}

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const routeParam = String(params.id ?? "");
  const { data: availableYears } = useSWR<number[]>(
    "/api/dashboard/stats-years",
    fetchJson,
  );
  const [selectedYear, setSelectedYear] = useState<string>("overall");
  const selectedYearValue = selectedYear === "overall" ? null : Number.parseInt(selectedYear, 10);
  const selectedYearIndex = useMemo(() => {
    if (!availableYears || selectedYearValue === null) return -1;
    return availableYears.findIndex((year) => year === selectedYearValue);
  }, [availableYears, selectedYearValue]);

  const { data: players } = useSWR<ApiPlayer[]>("/api/players", fetchJson);
  const { data: me } = useSWR<MeResponse>("/api/auth/me", fetchJson);
  const { data: leaderboardRows } = useSWR<LeaderboardRow[]>(
    `/api/dashboard/leaderboard?year=${selectedYear}`,
    fetchJson,
  );
  const { data: summaryRows } = useSWR<SummaryTableRow[]>(
    `/api/dashboard/summary-table?year=${selectedYear}`,
    fetchJson,
  );
  const { data: games } = useSWR<ApiGame[]>("/api/games", fetchJson);

  const orderedRows = leaderboardRows ?? [];
  const fallbackIdx = Number(routeParam);
  const selectedFromId = orderedRows.findIndex((row) => row.id === routeParam);
  const selectedIndex =
    selectedFromId >= 0
      ? selectedFromId
      : Number.isFinite(fallbackIdx) && fallbackIdx >= 0 && fallbackIdx < orderedRows.length
        ? fallbackIdx
        : 0;

  const selected = orderedRows[selectedIndex] ?? null;

  const { data: placements } = useSWR<ApiPlacement[]>(
    "/api/stats/history",
    (url: string) => fetchJson<ApiPlacement[]>(url),
  );

  const derivedData = useMemo<PlayerDerivedData | undefined>(() => {
    if (!selected || !games || !placements) return undefined;

    const gameMap = new Map(games.map((g) => [g.id, g]));

    const filteredPlacements =
      selectedYearValue === null
        ? placements
        : placements.filter((row) => new Date(row.closed_at).getFullYear() === selectedYearValue);

    // Build snapshot metadata (player count, worst place per snapshot)
    const snapshotMeta = new Map<string, { playerCount: number; worstPlace: number }>();
    for (const row of filteredPlacements) {
      const current = snapshotMeta.get(row.snapshot_id) ?? { playerCount: 0, worstPlace: 0 };
      current.playerCount += 1;
      current.worstPlace = Math.max(current.worstPlace, row.place);
      snapshotMeta.set(row.snapshot_id, current);
    }

    // Game breakdown: group by game_id, count wins/losses
    const gameStats = new Map<string, { wins: number; losses: number; games: number }>();
    const monthlyCounts = new Map<string, number>();
    const rivalWinMap = new Map<string, { wins: number; total: number }>();

    // Group placements by snapshot to compute rivals
    const snapshotPlacements = new Map<string, ApiPlacement[]>();
    for (const row of filteredPlacements) {
      const list = snapshotPlacements.get(row.snapshot_id) ?? [];
      list.push(row);
      snapshotPlacements.set(row.snapshot_id, list);
    }

    for (const row of filteredPlacements) {
      if (row.user_id !== selected.id) continue;

      // Activity tracking
      const closedAt = new Date(row.closed_at);
      const key = `${closedAt.getFullYear()}-${closedAt.getMonth()}`;
      monthlyCounts.set(key, (monthlyCounts.get(key) ?? 0) + 1);

      // Game breakdown
      const stats = gameStats.get(row.game_id) ?? { wins: 0, losses: 0, games: 0 };
      stats.games += 1;
      if (row.place === 1) {
        stats.wins += 1;
      } else {
        const meta = snapshotMeta.get(row.snapshot_id);
        if (meta && meta.playerCount > 1 && meta.worstPlace > 1 && row.place === meta.worstPlace) {
          stats.losses += 1;
        }
      }
      gameStats.set(row.game_id, stats);

      // Rivals: compare with other players in the same snapshot
      const snapshotPlayers = snapshotPlacements.get(row.snapshot_id) ?? [];
      for (const other of snapshotPlayers) {
        if (other.user_id === selected.id) continue;
        const duel = rivalWinMap.get(other.user_id) ?? { wins: 0, total: 0 };
        duel.total += 1;
        if (row.place < other.place) duel.wins += 1;
        rivalWinMap.set(other.user_id, duel);
      }
    }

    const gameBreakdown: GameBreakdownRow[] = [];
    for (const [gameId, stats] of gameStats) {
      const game = gameMap.get(gameId);
      if (!game || stats.games === 0) continue;
      gameBreakdown.push({
        name: game.name,
        icon: game.icon,
        wins: stats.wins,
        losses: stats.losses,
        games: stats.games,
      });
    }
    gameBreakdown.sort((a, b) => b.games - a.games || b.wins - a.wins);

    const bestGame =
      gameBreakdown.length > 0
        ? [...gameBreakdown].sort(
            (a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games,
          )[0]
        : null;

    const activityMonths =
      selectedYearValue !== null
        ? Array.from({ length: 12 }, (_, month) => ({
            key: `${selectedYearValue}-${month}`,
            label: monthLabelFromIndex(month),
          }))
        : Array.from({ length: 12 }, (_, i) => {
            const now = new Date();
            const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
            return {
              key: `${d.getFullYear()}-${d.getMonth()}`,
              label: monthLabel(d),
            };
          });

    const activityLabels = activityMonths.map((m) => m.label);
    const activityData = activityMonths.map((m) => monthlyCounts.get(m.key) ?? 0);

    const rivals = Array.from(rivalWinMap.entries())
      .map(([userId, duel]) => {
        const rivalName = players?.find((p) => p.id === userId)?.username ?? "Ismeretlen";
        const pct = duel.total > 0 ? Math.round((duel.wins / duel.total) * 100) : 0;
        return {
          name: rivalName,
          pct,
          total: duel.total,
          color: rivalColor(pct),
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total || b.pct - a.pct)
      .slice(0, 3)
      .map(({ name, pct, color }) => ({ name, pct, color }));

    return {
      gameBreakdown,
      activityData,
      activityLabels,
      rivals,
      bestGameName: bestGame?.name ?? "N/A",
    };
  }, [selected, games, placements, players, selectedYearValue]);

  const pct = selected?.win_rate ?? 0;
  const totalGames = selected?.total_rounds ?? 0;
  const wins = selected?.wins ?? 0;
  const losses = selected?.losses ?? 0;
  const streak = summaryRows?.find((row) => row.id === selected?.id)?.streak ?? 0;
  const activityData = derivedData?.activityData ?? [];
  const activityLabels = derivedData?.activityLabels ?? [];
  const gameBreakdown = derivedData?.gameBreakdown ?? [];
  const rivals = derivedData?.rivals ?? [];
  const actMax = Math.max(...activityData, 1);
  const selectedPlayer = players?.find((p) => p.id === selected?.id) ?? null;
  const canEditAccount = !!selected && !!me && (me.role === "leader" || me.user_id === selected.id);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPassword2, setAccountPassword2] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSuccess, setAccountSuccess] = useState<string | null>(null);
  const [isUpdatingAccount, setIsUpdatingAccount] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  function prev() {
    if (!orderedRows.length) return;
    const i = (selectedIndex - 1 + orderedRows.length) % orderedRows.length;
    router.push(`/players/${orderedRows[i].id}`);
  }

  function next() {
    if (!orderedRows.length) return;
    const i = (selectedIndex + 1) % orderedRows.length;
    router.push(`/players/${orderedRows[i].id}`);
  }

  function prevYear() {
    if (!availableYears || availableYears.length === 0) return;
    if (selectedYear === "overall") {
      setSelectedYear(String(availableYears[0]));
      return;
    }
    if (selectedYearIndex < 0) return;
    const target = availableYears[selectedYearIndex + 1];
    if (target === undefined) {
      setSelectedYear("overall");
      return;
    }
    setSelectedYear(String(target));
  }

  function nextYear() {
    if (!availableYears || availableYears.length === 0) return;
    if (selectedYear === "overall") return;
    if (selectedYearIndex <= 0) {
      setSelectedYear(String(availableYears[0]));
      return;
    }
    const target = availableYears[selectedYearIndex - 1];
    if (target !== undefined) setSelectedYear(String(target));
  }

  function openAccountModal() {
    setAccountEmail(selectedPlayer?.email ?? "");
    setAccountPassword("");
    setAccountPassword2("");
    setAccountError(null);
    setAccountSuccess(null);
    setIsAccountModalOpen(true);
  }

  function closeAccountModal() {
    setIsAccountModalOpen(false);
  }

  async function handleAccountUpdate() {
    if (!selected) return;

    const trimmedEmail = accountEmail.trim();
    const currentEmail = (selectedPlayer?.email ?? "").trim();
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

      const res = await fetch(`/api/players/${selected.id}`, {
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

  return (
    <div className="view">
      {/* ── Header ── */}
      <div className={styles["player-hdr"]}>
        <div
          className={`${styles.avatar} ${styles.av64}`}
          style={{ background: avatarColor(selected?.id ?? "fallback"), color: "#fff" }}
        >
          {selected?.username?.[0] ?? "?"}
        </div>
        <div className={styles["player-hdr-info"]}>
          <div className={styles["player-pid"]}>{selected?.id ?? "..."}</div>
          <h1>{selected?.username ?? "Betöltés..."}</h1>
          <div className={styles["player-sub"]}>
            {totalGames} meccsből {wins} megnyerve · Legjobb: {derivedData?.bestGameName ?? "..."}
          </div>
        </div>
        <div className={styles["player-nav"]}>
          <ActionButton text="← Előző" variant="ghost" onClick={prev} />
          
          <select
            className={styles["year-select"]}
            value={selectedYear}
            onChange={(event) => setSelectedYear(event.target.value)}
          >
            <option value="overall">Összes év</option>
            {(availableYears ?? []).map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
          
          <ActionButton text="Következő →" variant="ghost" onClick={next} />
          {canEditAccount && (
            <ActionButton text="Fiók szerkesztése" variant="ghost" onClick={openAccountModal} />
          )}
        </div>
      </div>

      {/* ── 4 stat cards ── */}
      <div className={styles.pstats4}>
        <StatisticCard label="Győzelmi arány" value={`${pct}%`} dark />
        <StatisticCard
          label="Győzelmek"
          value={String(wins)}
          subLabel={`${totalGames} meccsből`}
        />
        <StatisticCard
          label="Vesztések"
          value={String(losses)}
          subLabel={`${totalGames} meccsből`}
        />
        <StatisticCard
          label="Legjobb sorozat"
          value={`${streak} 🔥`}
          subLabel="egymás utáni győzelem"
        />
      </div>

      {/* ── 2-column bottom ── */}
      <div className={styles.pdash2}>
        {/* Left: game breakdown */}
        <div className={styles.card}>
          <div className={styles.p24}>
            <div className={styles["section-hdr"]}>
              <h2>Játékonkénti eredmények</h2>
            </div>
            <div className={styles["pgi-wrap"]}>
              {gameBreakdown.map((g) => (
                <div className={styles["pgi-row"]} key={g.name}>
                  <div className={styles["pgi-name"]}>
                    <span style={{ fontSize: 18 }}>{g.icon}</span>
                    {g.name}
                  </div>
                  <div className={styles["pgi-stats"]}>
                    <div className={styles["pgi-stat"]}>
                      <div className={`${styles.v} ${styles.green}`}>
                        {g.wins}
                      </div>
                      <div className={styles.l}>Győz</div>
                    </div>
                    <div className={styles["pgi-stat"]}>
                      <div className={`${styles.v} ${styles.red}`}>
                        {g.losses}
                      </div>
                      <div className={styles.l}>Veszt</div>
                    </div>
                    <div className={styles["pgi-stat"]}>
                      <div className={styles.v}>
                        {Math.round((g.wins / g.games) * 100)}%
                      </div>
                      <div className={styles.l}>Win%</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div>
          {/* Activity chart */}
          <div
            className={styles.card}
            style={{ padding: 24, marginBottom: 14 }}
          >
            <div className={styles["section-hdr"]}>
              <h2>Havi aktivitás</h2>
            </div>
            <div className={styles["act-bars"]}>
              {activityData.map((v, i) => (
                <div className={styles["act-bar-wrap"]} key={i}>
                  <div className={styles["act-val"]}>{v}</div>
                  <div className={styles["act-bar-inner"]}>
                    <div
                      className={styles["act-bar"]}
                      style={{
                        height: Math.max(6, (v / actMax) * 84),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 6,
              }}
            >
              {activityLabels.map((label) => (
                <span className={styles["act-label"]} key={label}>
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Rivals */}
          <div className={styles.card} style={{ padding: 24 }}>
            <div className={styles["section-hdr"]}>
              <h2>Eredmény ellenfeleknél</h2>
            </div>
            {rivals.map((r) => (
              <div className={styles["rival-row"]} key={r.name}>
                <div
                  className={`${styles.avatar} ${styles.av36}`}
                  style={{
                    background: "var(--slate-100)",
                    color: "var(--slate-700)",
                    fontSize: 13,
                  }}
                >
                  {r.name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      marginBottom: 5,
                    }}
                  >
                    {r.name} ellen
                  </div>
                  <div className={styles["bar-track"]}>
                    <div
                      className={styles["bar-fill"]}
                      style={{
                        width: `${r.pct}%`,
                        background: r.color,
                      }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: r.color,
                  }}
                >
                  {r.pct}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isClient &&
        isAccountModalOpen &&
        selected &&
        createPortal(
          <div className={styles["modal-overlay"]}>
            <div className={styles["modal-backdrop"]} onClick={closeAccountModal} />
            <div className={styles["modal-panel"]}>
              <button className={styles["modal-close"]} onClick={closeAccountModal}>
                <X size={14} />
              </button>
              <h2>Fiók szerkesztése</h2>
              <p className={styles["modal-subtitle"]}>
                {selected.username} adatai: email frissítés és opcionális jelszócsere.
              </p>

              <div className={styles["modal-fields"]}>
                <div className={styles["modal-static-field"]}>
                  <div className={styles["modal-static-label"]}>Felhasználónév</div>
                  <div className={styles["modal-static-value"]}>{selected.username}</div>
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
                <ActionButton text="Mégse" variant="ghost" onClick={closeAccountModal} />
                <Button text="Mentés" onClick={handleAccountUpdate} disabled={isUpdatingAccount} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
