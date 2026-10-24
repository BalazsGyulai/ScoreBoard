// Refresh token store with rotation and reuse detection.
//
// A refresh token is an opaque random string. Only its SHA-256 hash is stored, so a
// database leak does not leak usable tokens. Every refresh marks the presented token
// as rotated and issues a new one in the same family (one family = one login).
//
// Reuse detection: a rotated token presented again after the grace window means
// someone else holds a copy, so the whole family is revoked and that login ends.
// Within the grace window it is treated as a concurrent refresh (two tabs, or a page
// load that fires several requests at once) and gets its own new token.

use chrono::{DateTime, Duration, Utc};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::AppState;

pub enum RefreshOutcome {
    Rotated {
        user_id: Uuid,
        group_id: Uuid,
        username: String,
        role: String,
        token: String,
    },
    /// Unknown, expired or revoked token.
    Rejected,
    /// A rotated token was replayed after the grace window; its family is now revoked.
    ReuseDetected,
}

/// URL-safe random token (32 bytes → 43-char base64url, no padding).
pub fn random_token() -> String {
    use std::io::Read;
    let mut buf = [0u8; 32];
    if std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut buf))
        .is_err()
    {
        // UUID v4 is generated from the OS CSPRNG as well.
        return format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    }
    base64_url_encode(&buf)
}

fn base64_url_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut result = String::with_capacity((data.len() * 4).div_ceil(3));
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        }
    }
    result
}

pub fn hash_token(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn refresh_token_ttl_secs(state: &AppState) -> i64 {
    state.config.jwt_refresh_expiry_days * 86_400
}

/// Store a new refresh token for `user_id` and return the plain token (for the cookie).
pub async fn issue<'e, E>(
    executor: E,
    state: &AppState,
    user_id: Uuid,
    family_id: Uuid,
) -> Result<String, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    let token = random_token();
    let expires_at: DateTime<Utc> = Utc::now() + Duration::seconds(refresh_token_ttl_secs(state));

    sqlx::query!(
        r#"INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at)
           VALUES ($1, $2, $3, $4, $5)"#,
        Uuid::new_v4(),
        user_id,
        family_id,
        hash_token(&token),
        expires_at,
    )
    .execute(executor)
    .await?;

    Ok(token)
}

/// Start a new session family (login / register).
pub async fn issue_new_family(state: &AppState, user_id: Uuid) -> Result<String, sqlx::Error> {
    // Housekeeping: drop this user's dead tokens so the table stays small.
    sqlx::query!(
        r#"DELETE FROM refresh_tokens
           WHERE user_id = $1
             AND (expires_at < NOW()
                  OR revoked_at < NOW() - INTERVAL '1 day'
                  OR rotated_at < NOW() - INTERVAL '7 days')"#,
        user_id,
    )
    .execute(&state.db)
    .await?;

    issue(&state.db, state, user_id, Uuid::new_v4()).await
}

/// Exchange a refresh token for a new one (rotation).
pub async fn rotate(state: &AppState, presented: &str) -> Result<RefreshOutcome, sqlx::Error> {
    let mut tx = state.db.begin().await?;

    // FOR UPDATE serialises concurrent refreshes of the same token.
    let row = sqlx::query!(
        r#"SELECT rt.id, rt.family_id, rt.expires_at, rt.rotated_at, rt.revoked_at,
                  u.id AS user_id, u.group_id, u.username, u.role::TEXT AS "role!"
           FROM refresh_tokens rt
           JOIN users u ON u.id = rt.user_id
           WHERE rt.token_hash = $1
           FOR UPDATE OF rt"#,
        hash_token(presented),
    )
    .fetch_optional(&mut *tx)
    .await?;

    let Some(row) = row else {
        return Ok(RefreshOutcome::Rejected);
    };

    let now = Utc::now();
    if row.revoked_at.is_some() || row.expires_at <= now {
        return Ok(RefreshOutcome::Rejected);
    }

    match row.rotated_at {
        Some(rotated_at) if now - rotated_at > Duration::seconds(state.config.refresh_reuse_grace_seconds) => {
            sqlx::query!(
                "UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL",
                row.family_id,
            )
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            tracing::warn!(user_id = %row.user_id, "refresh token reuse detected, session family revoked");
            return Ok(RefreshOutcome::ReuseDetected);
        }
        // Concurrent refresh inside the grace window: hand out a sibling token.
        Some(_) => {}
        None => {
            sqlx::query!("UPDATE refresh_tokens SET rotated_at = NOW() WHERE id = $1", row.id)
                .execute(&mut *tx)
                .await?;
        }
    }

    let token = issue(&mut *tx, state, row.user_id, row.family_id).await?;
    tx.commit().await?;

    Ok(RefreshOutcome::Rotated {
        user_id: row.user_id,
        group_id: row.group_id,
        username: row.username,
        role: row.role,
        token,
    })
}

/// Family of the presented token, if it is known.
pub async fn family_of(state: &AppState, presented: &str) -> Result<Option<Uuid>, sqlx::Error> {
    let row = sqlx::query!(
        "SELECT family_id FROM refresh_tokens WHERE token_hash = $1",
        hash_token(presented),
    )
    .fetch_optional(&state.db)
    .await?;
    Ok(row.map(|r| r.family_id))
}

/// Logout: revoke every token of the presented token's family.
pub async fn revoke_family_of(state: &AppState, presented: &str) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE refresh_tokens SET revoked_at = NOW()
           WHERE revoked_at IS NULL
             AND family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)"#,
        hash_token(presented),
    )
    .execute(&state.db)
    .await?;
    Ok(())
}

/// Revoke all of a user's sessions, optionally keeping one family (the caller's own).
pub async fn revoke_user_sessions(
    state: &AppState,
    user_id: Uuid,
    keep_family: Option<Uuid>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE refresh_tokens SET revoked_at = NOW()
           WHERE user_id = $1
             AND revoked_at IS NULL
             AND ($2::UUID IS NULL OR family_id <> $2)"#,
        user_id,
        keep_family,
    )
    .execute(&state.db)
    .await?;
    Ok(())
}
