use std::collections::{BTreeMap, HashMap, HashSet};
use std::env;
use std::fs;

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use sqlx::postgres::PgPoolOptions;
use sqlx::Executor;
use uuid::Uuid;

#[derive(Debug, Clone)]
struct LegacyUser {
    legacy_id: i32,
    username: String,
    pass_hash: String,
    group_token: String,
    role: String,
}

#[derive(Debug, Clone)]
struct LegacyGameSetting {
    game_name: String,
    winner_rule: String,
    group_token: String,
}

#[derive(Debug, Clone)]
struct LegacyScore {
    user_id: i32,
    value: i32,
    round: i32,
    game_name: String,
    calendar: String,
}

#[derive(Debug, Clone)]
struct MatchGroup {
    group_id: Uuid,
    game_name: String,
    winner_rule: String,
    closed_at: DateTime<Utc>,
    rows: Vec<ScoreWithUser>,
}

#[derive(Debug, Clone)]
struct ScoreWithUser {
    user_id: Uuid,
    value: i32,
    round: i32,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    let args: Vec<String> = env::args().collect();
    let dump_path = args
        .iter()
        .position(|a| a == "--dump")
        .and_then(|idx| args.get(idx + 1))
        .cloned()
        .unwrap_or_else(|| "./_legacy_mysql_dump.sql".to_string());
    let truncate = args.iter().any(|a| a == "--truncate");

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let dump = fs::read_to_string(&dump_path)?;

    let users = parse_users(&dump)?;
    let navsettings = parse_navsettings(&dump)?;
    let scores = parse_jatekok(&dump)?;

    if users.is_empty() {
        return Err("No users found in legacy dump".into());
    }

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    let mut tx = pool.begin().await?;

    if truncate {
        tx.execute("TRUNCATE TABLE refresh_tokens, score_archives, game_results, scores, games, users, groups CASCADE")
            .await?;
    }

    let mut existing_users: i64 = 0;
    if !truncate {
        let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&mut *tx)
            .await?;
        existing_users = row.0;
    }
    if existing_users > 0 {
        return Err("Target database is not empty. Re-run with --truncate if this is intentional.".into());
    }

    let mut group_tokens: HashSet<String> = HashSet::new();
    for u in &users {
        group_tokens.insert(u.group_token.clone());
    }
    for s in &navsettings {
        group_tokens.insert(s.group_token.clone());
    }

    let mut group_map: HashMap<String, Uuid> = HashMap::new();
    for token in group_tokens {
        let group_id = Uuid::new_v4();
        sqlx::query("INSERT INTO groups (id) VALUES ($1)")
            .bind(group_id)
            .execute(&mut *tx)
            .await?;
        group_map.insert(token, group_id);
    }

    let mut user_map: HashMap<i32, (Uuid, String)> = HashMap::new();
    for u in &users {
        let user_id = Uuid::new_v4();
        let role = normalize_role(&u.role);
        let email = format!("legacy-user-{}@legacy.local", u.legacy_id);
        let group_id = *group_map
            .get(&u.group_token)
            .ok_or_else(|| format!("Missing group mapping for token {}", u.group_token))?;

        sqlx::query(
            "INSERT INTO users (id, group_id, username, pass_hash, role, email) VALUES ($1, $2, $3, $4, $5::membership, $6)",
        )
        .bind(user_id)
        .bind(group_id)
        .bind(&u.username)
        .bind(normalize_bcrypt_hash(&u.pass_hash))
        .bind(role)
        .bind(email)
        .execute(&mut *tx)
        .await?;

        user_map.insert(u.legacy_id, (user_id, u.group_token.clone()));
    }

    let mut rule_map: HashMap<(String, String), String> = HashMap::new();
    for gs in navsettings {
        let key = (gs.group_token.clone(), gs.game_name.clone());
        rule_map.entry(key).or_insert_with(|| normalize_rule(&gs.winner_rule));
    }

    // (group_token, game_name, calendar) -> rows
    let mut grouped: BTreeMap<(String, String, String), Vec<ScoreWithUser>> = BTreeMap::new();
    for s in scores {
        let (new_user_id, user_group_token) = user_map
            .get(&s.user_id)
            .ok_or_else(|| format!("Score references unknown user id {}", s.user_id))?
            .clone();
        grouped
            .entry((user_group_token, s.game_name, s.calendar))
            .or_default()
            .push(ScoreWithUser {
                user_id: new_user_id,
                value: s.value,
                round: s.round,
            });
    }

    let mut matches: Vec<MatchGroup> = Vec::new();
    for ((group_token, game_name, calendar), rows) in grouped {
        let group_id = *group_map
            .get(&group_token)
            .ok_or_else(|| format!("Missing group mapping for token {}", group_token))?;
        let winner_rule = rule_map
            .get(&(group_token.clone(), game_name.clone()))
            .cloned()
            .unwrap_or_else(|| "min".to_string());
        let closed_at = parse_legacy_calendar(&calendar)?;
        matches.push(MatchGroup {
            group_id,
            game_name,
            winner_rule,
            closed_at,
            rows,
        });
    }
    matches.sort_by_key(|m| m.closed_at);

    // games has UNIQUE(group_id, name), so keep one game row per legacy group+game
    // and attach many immutable snapshots to that same game_id.
    let mut game_meta: HashMap<(Uuid, String), (String, DateTime<Utc>, i32)> = HashMap::new();
    for m in &matches {
        let key = (m.group_id, m.game_name.clone());
        let max_round = m.rows.iter().map(|r| r.round).max().unwrap_or(1);
        if let Some((rule, latest_closed, existing_max_round)) = game_meta.get_mut(&key) {
            if *latest_closed < m.closed_at {
                *latest_closed = m.closed_at;
            }
            if *existing_max_round < max_round {
                *existing_max_round = max_round;
            }
            if rule != &m.winner_rule {
                *rule = m.winner_rule.clone();
            }
        } else {
            game_meta.insert(key, (m.winner_rule.clone(), m.closed_at, max_round));
        }
    }

    let mut game_id_map: HashMap<(Uuid, String), Uuid> = HashMap::new();
    for ((group_id, game_name), (winner_rule, latest_closed, max_round)) in &game_meta {
        let game_id = Uuid::new_v4();
        let current_round = *max_round + 1;
        sqlx::query(
            "INSERT INTO games (id, group_id, name, winner_rule, icon, current_round, status, closed_at, created_at) \
             VALUES ($1, $2, $3, $4, $5, $6, 'closed'::game_status, $7, $7)",
        )
        .bind(game_id)
        .bind(*group_id)
        .bind(game_name)
        .bind(winner_rule)
        .bind("🎲")
        .bind(current_round)
        .bind(*latest_closed)
        .execute(&mut *tx)
        .await?;

        game_id_map.insert((*group_id, game_name.clone()), game_id);
    }

    for m in matches {
        let game_id = *game_id_map
            .get(&(m.group_id, m.game_name.clone()))
            .ok_or_else(|| format!("Missing game mapping for {} / {}", m.group_id, m.game_name))?;
        let snapshot_id = Uuid::new_v4();

        for row in &m.rows {
            sqlx::query(
                "INSERT INTO score_archives (id, snapshot_id, game_id, user_id, round, value, recorded_at, archived_at) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $7)",
            )
            .bind(Uuid::new_v4())
            .bind(snapshot_id)
            .bind(game_id)
            .bind(row.user_id)
            .bind(row.round)
            .bind(row.value)
            .bind(m.closed_at)
            .execute(&mut *tx)
            .await?;
        }

        let results = compute_results(&m.rows, &m.winner_rule);
        for (user_id, total_score, place) in results {
            sqlx::query(
                "INSERT INTO game_results (snapshot_id, game_id, user_id, total_score, place, created_at) \
                 VALUES ($1, $2, $3, $4, $5, $6)",
            )
            .bind(snapshot_id)
            .bind(game_id)
            .bind(user_id)
            .bind(total_score)
            .bind(place)
            .bind(m.closed_at)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    println!("Legacy import completed from {dump_path}");
    println!("Imported users: {}", users.len());
    println!("Imported snapshots: {}", grouped_match_count(&dump)?);
    Ok(())
}

fn grouped_match_count(dump: &str) -> Result<usize, Box<dyn std::error::Error>> {
    let users = parse_users(dump)?;
    let user_group: HashMap<i32, String> = users.into_iter().map(|u| (u.legacy_id, u.group_token)).collect();
    let scores = parse_jatekok(dump)?;
    let mut keys: HashSet<(String, String, String)> = HashSet::new();
    for s in scores {
        let token = user_group
            .get(&s.user_id)
            .ok_or_else(|| format!("Score references unknown user id {}", s.user_id))?
            .clone();
        keys.insert((token, s.game_name, s.calendar));
    }
    Ok(keys.len())
}

fn parse_users(dump: &str) -> Result<Vec<LegacyUser>, Box<dyn std::error::Error>> {
    let tuples = extract_insert_tuples(dump, "users")?;
    let mut out = Vec::with_capacity(tuples.len());
    for fields in tuples {
        if fields.len() != 5 {
            return Err(format!("users tuple length mismatch: expected 5, got {}", fields.len()).into());
        }
        out.push(LegacyUser {
            legacy_id: parse_i32(&fields[0])?,
            username: parse_string(&fields[1])?,
            pass_hash: parse_string(&fields[2])?,
            group_token: parse_string(&fields[3])?,
            role: parse_string(&fields[4])?,
        });
    }
    Ok(out)
}

fn parse_navsettings(dump: &str) -> Result<Vec<LegacyGameSetting>, Box<dyn std::error::Error>> {
    let tuples = extract_insert_tuples(dump, "navsettings")?;
    let mut out = Vec::with_capacity(tuples.len());
    for fields in tuples {
        if fields.len() != 4 {
            return Err(format!("navsettings tuple length mismatch: expected 4, got {}", fields.len()).into());
        }
        out.push(LegacyGameSetting {
            game_name: parse_string(&fields[1])?,
            winner_rule: parse_string(&fields[2])?,
            group_token: parse_string(&fields[3])?,
        });
    }
    Ok(out)
}

fn parse_jatekok(dump: &str) -> Result<Vec<LegacyScore>, Box<dyn std::error::Error>> {
    let tuples = extract_insert_tuples(dump, "jatekok")?;
    let mut out = Vec::with_capacity(tuples.len());
    for fields in tuples {
        if fields.len() != 6 {
            return Err(format!("jatekok tuple length mismatch: expected 6, got {}", fields.len()).into());
        }
        out.push(LegacyScore {
            user_id: parse_i32(&fields[1])?,
            value: parse_i32(&fields[2])?,
            round: parse_i32(&fields[3])?,
            game_name: parse_string(&fields[4])?,
            calendar: parse_string(&fields[5])?,
        });
    }
    Ok(out)
}

fn extract_insert_tuples(dump: &str, table: &str) -> Result<Vec<Vec<String>>, Box<dyn std::error::Error>> {
    let needle = format!("INSERT INTO `{table}` VALUES ");
    let start = dump
        .find(&needle)
        .ok_or_else(|| format!("Could not find INSERT statement for table `{table}`"))?;
    let values_start = start + needle.len();
    let rest = &dump[values_start..];
    let end = rest
        .find(";\n")
        .or_else(|| rest.find(';'))
        .ok_or_else(|| format!("Could not find end of INSERT statement for table `{table}`"))?;
    let values = &rest[..end];
    split_tuples(values)
}

fn split_tuples(values: &str) -> Result<Vec<Vec<String>>, Box<dyn std::error::Error>> {
    let mut rows = Vec::new();
    let mut current_fields: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_quote = false;
    let mut escape = false;
    let mut depth = 0i32;

    for ch in values.chars() {
        if escape {
            current.push(ch);
            escape = false;
            continue;
        }

        if in_quote && ch == '\\' {
            current.push(ch);
            escape = true;
            continue;
        }

        if ch == '\'' {
            in_quote = !in_quote;
            current.push(ch);
            continue;
        }

        if !in_quote {
            match ch {
                '(' => {
                    depth += 1;
                    if depth == 1 {
                        current_fields.clear();
                        current.clear();
                        continue;
                    }
                    current.push(ch);
                }
                ')' => {
                    if depth == 1 {
                        current_fields.push(current.trim().to_string());
                        rows.push(current_fields.clone());
                        current.clear();
                        current_fields.clear();
                        depth = 0;
                        continue;
                    }
                    if depth > 1 {
                        depth -= 1;
                    }
                    current.push(ch);
                }
                ',' => {
                    if depth == 1 {
                        current_fields.push(current.trim().to_string());
                        current.clear();
                        continue;
                    }
                    current.push(ch);
                }
                _ => current.push(ch),
            }
        } else {
            current.push(ch);
        }
    }

    if in_quote || depth != 0 {
        return Err("Malformed INSERT values payload".into());
    }
    Ok(rows)
}

fn parse_i32(raw: &str) -> Result<i32, Box<dyn std::error::Error>> {
    let value = raw.trim();
    Ok(value.parse::<i32>()?)
}

fn parse_string(raw: &str) -> Result<String, Box<dyn std::error::Error>> {
    let value = raw.trim();
    if value == "NULL" {
        return Ok(String::new());
    }
    if !value.starts_with('\'') || !value.ends_with('\'') {
        return Err(format!("Expected SQL string literal, got {value}").into());
    }
    let inner = &value[1..value.len() - 1];
    Ok(unescape_mysql_string(inner))
}

fn unescape_mysql_string(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            if let Some(next) = chars.next() {
                match next {
                    '0' => out.push('\0'),
                    'n' => out.push('\n'),
                    'r' => out.push('\r'),
                    't' => out.push('\t'),
                    'Z' => out.push('\u{001A}'),
                    '\'' => out.push('\''),
                    '"' => out.push('"'),
                    '\\' => out.push('\\'),
                    _ => {
                        out.push('\\');
                        out.push(next);
                    }
                }
            } else {
                out.push('\\');
            }
        } else {
            out.push(ch);
        }
    }
    out
}

fn parse_legacy_calendar(calendar: &str) -> Result<DateTime<Utc>, Box<dyn std::error::Error>> {
    let naive = NaiveDateTime::parse_from_str(calendar, "%Y.%m.%d. %H:%M")?;
    Ok(Utc.from_utc_datetime(&naive))
}

fn normalize_role(role: &str) -> &'static str {
    match role {
        "leader" => "leader",
        "viewer" => "viewer",
        _ => "member",
    }
}

fn normalize_rule(rule: &str) -> String {
    if rule == "max" {
        "max".to_string()
    } else {
        "min".to_string()
    }
}

fn normalize_bcrypt_hash(hash: &str) -> String {
    if hash.starts_with("$2y$") {
        hash.replacen("$2y$", "$2b$", 1)
    } else {
        hash.to_string()
    }
}

fn compute_results(rows: &[ScoreWithUser], winner_rule: &str) -> Vec<(Uuid, i32, i32)> {
    let mut totals: HashMap<Uuid, i32> = HashMap::new();
    for row in rows {
        *totals.entry(row.user_id).or_insert(0) += row.value;
    }

    let mut ranked: Vec<(Uuid, i32)> = totals.into_iter().collect();
    if winner_rule == "max" {
        ranked.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    } else {
        ranked.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
    }

    let mut out: Vec<(Uuid, i32, i32)> = Vec::with_capacity(ranked.len());
    for (idx, (user_id, total)) in ranked.iter().enumerate() {
        let place = if idx == 0 {
            1
        } else if *total == ranked[idx - 1].1 {
            out[idx - 1].2
        } else {
            (idx + 1) as i32
        };
        out.push((*user_id, *total, place));
    }
    out
}
