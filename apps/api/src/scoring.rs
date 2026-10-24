//! Standings of one game session (the rule behind every place, win and loss).
//!
//! The same rule is implemented in apps/web/lib/scoring/standings.ts for the live
//! screens; both are tested against packages/scoring/standings-cases.json.
//!
//! Rules:
//! 1. Participants are the players with at least one score. A player who never
//!    scored is not in the standings (and gets no place, win or loss).
//! 2. More rounds played ranks first; with equal rounds the total decides
//!    (lowest wins for "min", highest for "max"). A missing round therefore never
//!    counts as 0 points — skipping a round cannot win a min game.
//! 3. Equal rounds played and equal total share the place (competition ranking:
//!    1, 1, 3). Every player on place 1 is a winner.
//! 4. The players on the last place lose — but only if there is more than one
//!    place (when everyone ties, nobody loses).

use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WinnerRule {
    Min,
    Max,
}

impl WinnerRule {
    pub fn parse(rule: &str) -> Self {
        if rule == "min" { WinnerRule::Min } else { WinnerRule::Max }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Standing<K> {
    pub player: K,
    pub total: i64,
    pub rounds_played: i32,
    pub place: i32,
}

/// Rank the participants of one session. `entries` are `(player, round, value)`.
/// The result is ordered by place, then by player key (deterministic).
pub fn standings<K: Ord + Clone>(entries: &[(K, i32, i64)], rule: WinnerRule) -> Vec<Standing<K>> {
    let mut per_player: BTreeMap<K, (i64, i32)> = BTreeMap::new();
    for (player, _round, value) in entries {
        let e = per_player.entry(player.clone()).or_insert((0, 0));
        e.0 += value;
        e.1 += 1;
    }

    let mut rows: Vec<Standing<K>> = per_player
        .into_iter()
        .map(|(player, (total, rounds_played))| Standing { player, total, rounds_played, place: 0 })
        .collect();

    // (rounds desc, total by rule) — the sort key; player key only breaks display order.
    let key = |s: &Standing<K>| {
        let total = match rule {
            WinnerRule::Min => s.total,
            WinnerRule::Max => -s.total,
        };
        (-s.rounds_played, total)
    };
    rows.sort_by(|a, b| key(a).cmp(&key(b)).then_with(|| a.player.cmp(&b.player)));

    for i in 0..rows.len() {
        rows[i].place = if i > 0 && key(&rows[i]) == key(&rows[i - 1]) {
            rows[i - 1].place
        } else {
            i as i32 + 1
        };
    }
    rows
}

/// Players on place 1.
pub fn winners<K: Clone>(rows: &[Standing<K>]) -> Vec<K> {
    rows.iter().filter(|s| s.place == 1).map(|s| s.player.clone()).collect()
}

/// Players on the last place, if there is more than one place.
pub fn losers<K: Clone>(rows: &[Standing<K>]) -> Vec<K> {
    let worst = rows.iter().map(|s| s.place).max().unwrap_or(1);
    if worst <= 1 {
        return Vec::new();
    }
    rows.iter().filter(|s| s.place == worst).map(|s| s.player.clone()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Cases {
        cases: Vec<Case>,
    }

    #[derive(Deserialize)]
    struct Case {
        name: String,
        winner_rule: String,
        scores: Vec<(String, i32, i64)>,
        expected: Vec<Expected>,
        winners: Vec<String>,
        losers: Vec<String>,
    }

    #[derive(Deserialize)]
    struct Expected {
        player: String,
        total: i64,
        rounds: i32,
        place: i32,
    }

    #[test]
    fn shared_standings_cases() {
        let cases: Cases =
            serde_json::from_str(include_str!("../../../packages/scoring/standings-cases.json")).unwrap();
        assert!(cases.cases.len() >= 10);

        for case in cases.cases {
            let rows = standings(&case.scores, WinnerRule::parse(&case.winner_rule));
            let got: Vec<(String, i64, i32, i32)> =
                rows.iter().map(|s| (s.player.clone(), s.total, s.rounds_played, s.place)).collect();
            let want: Vec<(String, i64, i32, i32)> =
                case.expected.iter().map(|e| (e.player.clone(), e.total, e.rounds, e.place)).collect();
            assert_eq!(got, want, "case: {}", case.name);
            assert_eq!(winners(&rows), case.winners, "winners, case: {}", case.name);
            assert_eq!(losers(&rows), case.losers, "losers, case: {}", case.name);
        }
    }

    #[test]
    fn order_of_entries_does_not_matter() {
        let a = vec![("x", 1, 3), ("y", 1, 3), ("x", 2, 1), ("y", 2, 2)];
        let mut b = a.clone();
        b.reverse();
        assert_eq!(standings(&a, WinnerRule::Min), standings(&b, WinnerRule::Min));
    }

    #[test]
    fn large_values_do_not_overflow() {
        let rows = standings(&[("x", 1, i32::MAX as i64), ("x", 2, i32::MAX as i64)], WinnerRule::Max);
        assert_eq!(rows[0].total, 2 * i32::MAX as i64);
    }
}
