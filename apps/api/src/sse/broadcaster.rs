use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::broadcast;
use uuid::Uuid;

/// Events pushed to SSE viewers.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GameEvent {
    /// Full state snapshot (sent on initial connect).
    Init(GameState),
    /// Scores changed (round added or single score edited).
    ScoresUpdated,
    /// Game was closed (final standings calculated).
    GameClosed,
    /// Game was restarted (back to open).
    GameRestarted,
}

/// Full game state sent on initial SSE connect.
#[derive(Clone, Debug, Serialize)]
pub struct GameState {
    pub game: GameInfo,
    pub players: Vec<PlayerInfo>,
    pub scores: Vec<ScoreRow>,
}

#[derive(Clone, Debug, Serialize)]
pub struct GameInfo {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub winner_rule: String,
    pub current_round: i32,
    pub status: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct PlayerInfo {
    pub id: String,
    pub username: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ScoreRow {
    pub id: String,
    pub user_id: String,
    pub username: String,
    pub round: i32,
    pub value: i32,
}

/// In-memory fan-out: one broadcast channel per game.
pub struct Broadcaster {
    channels: Mutex<HashMap<Uuid, broadcast::Sender<GameEvent>>>,
}

impl Broadcaster {
    pub fn new() -> Self {
        Self {
            channels: Mutex::new(HashMap::new()),
        }
    }

    /// Subscribe to events for a game. Creates the channel if it doesn't exist.
    pub fn subscribe(&self, game_id: Uuid) -> broadcast::Receiver<GameEvent> {
        let mut channels = self.channels.lock().unwrap();
        let tx = channels
            .entry(game_id)
            .or_insert_with(|| broadcast::channel(64).0);
        tx.subscribe()
    }

    /// Broadcast an event to all viewers of a game. No-op if nobody is listening.
    pub fn notify(&self, game_id: Uuid, event: GameEvent) {
        let channels = self.channels.lock().unwrap();
        if let Some(tx) = channels.get(&game_id) {
            // Ignore send errors — means no active receivers.
            let _ = tx.send(event);
        }
    }

    /// Remove the channel for a game (e.g. when sharing is turned off).
    pub fn remove(&self, game_id: Uuid) {
        let mut channels = self.channels.lock().unwrap();
        channels.remove(&game_id);
    }
}
