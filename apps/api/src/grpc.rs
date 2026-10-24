//! gRPC implementation of the GameStream service.
//!
//! This is a learning-oriented implementation that mirrors the SSE functionality.
//! Both use the same Broadcaster for event fan-out — the only difference is the
//! transport layer (gRPC vs SSE).

use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tonic::{Request, Response, Status};

use crate::sse::broadcaster::GameEvent as SseEvent;
use crate::sse::handlers::{fetch_game_state, resolve_share};
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

        // Same token check and same read-only, single-game view as the SSE endpoint.
        let game_id = resolve_share(&self.state, token)
            .await
            .map_err(|_| Status::internal("Database error"))?
            .ok_or_else(|| Status::not_found("Invalid or expired share token"))?;

        let init = fetch_game_state(&self.state, game_id)
            .await
            .map(to_snapshot)
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

/// Convert the shared viewer state into protobuf types.
fn to_snapshot(state: crate::sse::broadcaster::GameState) -> GameStateSnapshot {
    GameStateSnapshot {
        game: Some(GameInfo {
            id: state.game.id,
            name: state.game.name,
            icon: state.game.icon,
            winner_rule: state.game.winner_rule,
            current_round: state.game.current_round,
            status: state.game.status,
        }),
        players: state
            .players
            .into_iter()
            .map(|p| PlayerInfo { id: p.id, username: p.username })
            .collect(),
        scores: state
            .scores
            .into_iter()
            .map(|s| ScoreRow {
                id: s.id,
                user_id: s.user_id,
                username: s.username,
                round: s.round,
                value: s.value,
            })
            .collect(),
    }
}
