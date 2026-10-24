// Schema changes the running code cannot work without.
// Migrations are otherwise applied by hand (see docs/06_docker_guide.md), but login
// depends on the refresh-token columns, so this one is applied on startup too.
// The SQL file is idempotent, so running it again on every start is harmless.

use sqlx::PgPool;

const REFRESH_TOKEN_ROTATION: &str = include_str!("../../migrations/0008_refresh_token_rotation.sql");

pub async fn ensure(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::raw_sql(REFRESH_TOKEN_ROTATION).execute(pool).await?;
    Ok(())
}
