//! gRPC implementation of the GameStream service.
//!
//! This is a learning-oriented implementation that mirrors the SSE functionality.
//! Both use the same Broadcaster for event fan-out — the only difference is the
//! transport layer (gRPC vs SSE).

use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::sse::broadcaster::GameEvent as SseEvent;
use crate::AppState;

// Include the generated protobuf code.
pub mod pb {
    tonic::include_proto!("homegame");
}

use pb::game_stream_server::{GameStream, GameStreamServer};
use pb::{
    game_event, GameClosed, GameEvent, GameInfo, GameRestarted, GameStateSnapshot, PlayerInfo,
    ScoreRow, ScoresUpdated, WatchGameRequest,
};

/// The gRPC service implementation.
pub struct GameStreamService {
    state: AppState,
}

impl GameStreamService {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }

    /// Build a tonic server for this service.
    pub fn into_server(self) -> GameStreamServer<Self> {
        GameStreamServer::new(self)
    }
}

#[tonic::async_trait]
impl GameStream for GameStreamService {
    type WatchGameStream =
        std::pin::Pin<Box<dyn tokio_stream::Stream<Item = Result<GameEvent, Status>> + Send>>;

    async fn watch_game(
        &self,
        request: Request<WatchGameRequest>,
    ) -> Result<Response<Self::WatchGameStream>, Status> {
        let token = &request.get_ref().token;

        // Validate the share token (same logic as SSE handler).
        let share = sqlx::query(
            r#"
            SELECT gs.game_id, g.group_id
            FROM game_shares gs
            JOIN games g ON g.id = gs.game_id
            WHERE gs.token = $1
            "#,
        )
        .bind(token)
        .fetch_optional(&self.state.db)
        .await
        .map_err(|_| Status::internal("Database error"))?;

        let share = share.ok_or_else(|| Status::not_found("Invalid or expired share token"))?;

        use sqlx::Row;
        let game_id: Uuid = share.get("game_id");
        let group_id: Uuid = share.get("group_id");

        // Fetch initial state.
        let init = fetch_game_state_grpc(&self.state, game_id, group_id)
            .await
            .map_err(|_| Status::internal("Failed to fetch game state"))?;

        // Subscribe to broadcaster events.
        let rx = self.state.broadcaster.subscribe(game_id);

        // Build the output stream: init snapshot first, then broadcast events.
        let init_event = GameEvent {
            event: Some(game_event::Event::Init(init)),
        };

        let broadcast_stream = BroadcastStream::new(rx).filter_map(|result| match result {
            Ok(sse_event) => {
                let grpc_event = match sse_event {
                    SseEvent::ScoresUpdated => GameEvent {
                        event: Some(game_event::Event::ScoresUpdated(ScoresUpdated {})),
                    },
                    SseEvent::GameClosed => GameEvent {
                        event: Some(game_event::Event::GameClosed(GameClosed {})),
                    },
                    SseEvent::GameRestarted => GameEvent {
                        event: Some(game_event::Event::GameRestarted(GameRestarted {})),
                    },
                    SseEvent::Init(_) => return None, // shouldn't happen via broadcast
                };
                Some(Ok(grpc_event))
            }
            Err(_) => None, // lagged — skip
        });

        let stream = tokio_stream::once(Ok(init_event)).chain(broadcast_stream);

        Ok(Response::new(Box::pin(stream)))
    }
}

/// Fetch full game state and convert to protobuf types.
async fn fetch_game_state_grpc(
    state: &AppState,
    game_id: Uuid,
    group_id: Uuid,
) -> Result<GameStateSnapshot, sqlx::Error> {
    let game = sqlx::query!(
        r#"SELECT id, name, icon, winner_rule, current_round, status::TEXT AS "status!"
           FROM games WHERE id = $1"#,
        game_id,
    )
    .fetch_one(&state.db)
    .await?;

    let players = sqlx::query!(
        "SELECT id, username FROM users WHERE group_id = $1 ORDER BY username",
        group_id,
    )
    .fetch_all(&state.db)
    .await?;

    let scores = sqlx::query!(
        r#"SELECT s.id, s.user_id, u.username, s.round, s.value
           FROM scores s
           JOIN users u ON u.id = s.user_id
           WHERE s.game_id = $1
           ORDER BY s.round ASC, u.username ASC"#,
        game_id,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(GameStateSnapshot {
        game: Some(GameInfo {
            id: game.id.to_string(),
            name: game.name,
            icon: game.icon,
            winner_rule: game.winner_rule,
            current_round: game.current_round,
            status: game.status,
        }),
        players: players
            .into_iter()
            .map(|p| PlayerInfo {
                id: p.id.to_string(),
                username: p.username,
            })
            .collect(),
        scores: scores
            .into_iter()
            .map(|s| ScoreRow {
                id: s.id.to_string(),
                user_id: s.user_id.to_string(),
                username: s.username,
                round: s.round,
                value: s.value,
            })
            .collect(),
    })
}
