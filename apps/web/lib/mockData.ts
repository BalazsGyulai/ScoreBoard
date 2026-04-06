// Hardcoded mock data matching the HTML prototype.
// Will be replaced with real API calls later.

export const players = [
  { name: "Bali", id: "#1001", wins: 32, losses: 15, games: 47 },
  { name: "Geri", id: "#1002", wins: 28, losses: 19, games: 47 },
  { name: "Mama", id: "#1003", wins: 24, losses: 23, games: 47 },
  { name: "Atis", id: "#1004", wins: 20, losses: 21, games: 41 },
  { name: "Papa", id: "#1005", wins: 15, losses: 26, games: 41 },
  { name: "Anya", id: "#1006", wins: 12, losses: 30, games: 42 },
  { name: "Apa", id: "#1007", wins: 18, losses: 24, games: 42 },
];

export const avatarColors = [
  "#0F172A",
  "#475569",
  "#B45309",
  "#94A3B8",
  "#CBD5E1",
  "#E2E8F0",
  "#F1F5F9",
];

export interface MockGame {
  name: string;
  icon: string;
  sessions: number;
  lastWinner: string;
  status: "active" | "done";
}

export const gamesList: MockGame[] = [
  { name: "Skyjo", icon: "🃏", sessions: 11, lastWinner: "Geri", status: "active" },
  { name: "Társas", icon: "🎭", sessions: 8, lastWinner: "Mama", status: "done" },
  { name: "Ökrös", icon: "🐂", sessions: 5, lastWinner: "Bali", status: "done" },
  { name: "Mocsár", icon: "🌿", sessions: 6, lastWinner: "Atis", status: "done" },
  { name: "Skipbo", icon: "🂠", sessions: 4, lastWinner: "Anya", status: "done" },
  { name: "Frantic", icon: "🌀", sessions: 7, lastWinner: "Papa", status: "done" },
  { name: "Darts", icon: "🎯", sessions: 9, lastWinner: "Bali", status: "done" },
  { name: "Tenisz 2v1", icon: "🎾", sessions: 3, lastWinner: "Geri", status: "done" },
  { name: "Póker", icon: "♠️", sessions: 6, lastWinner: "Apa", status: "done" },
  { name: "Vasút", icon: "🚂", sessions: 4, lastWinner: "Atis", status: "done" },
  { name: "Quoridor", icon: "⬜", sessions: 3, lastWinner: "Bali", status: "done" },
  { name: "Chance kockás", icon: "🎲", sessions: 5, lastWinner: "Apa", status: "done" },
  { name: "Kuhhandel", icon: "🐄", sessions: 2, lastWinner: "Mama", status: "done" },
];

export const recentGames = [
  { name: "Skyjo", icon: "🃏", info: "7 játékos · 4 kör · ma", winner: "Geri" },
  { name: "Darts", icon: "🎯", info: "2 játékos · tegnap", winner: "Bali" },
  { name: "Frantic", icon: "🌀", info: "5 játékos · 2 napja", winner: "Mama" },
  { name: "Chance kockás", icon: "🎲", info: "4 játékos · 3 napja", winner: "Apa" },
  { name: "Vasút", icon: "🚂", info: "3 játékos · egy hete", winner: "Atis" },
];

// Score table data for the active Skyjo game
export const skyjoPlayers = ["Bali", "Geri", "Mama", "Atis", "Papa", "Anya", "Apa"];

export const initialRounds: (number | null)[][] = [
  [26, 9, 28, 18, null, 27, 22],
  [25, 20, 23, 11, null, 27, 19],
  [18, 23, 15, 8, null, 30, 28],
  [15, 19, 12, 4, null, 25, 14],
];

// Player stats page data
export const gameBreakdown = [
  { name: "Skyjo", icon: "🃏", wins: 8, losses: 3, games: 11 },
  { name: "Darts", icon: "🎯", wins: 7, losses: 2, games: 9 },
  { name: "Frantic", icon: "🌀", wins: 5, losses: 2, games: 7 },
  { name: "Társas", icon: "🎭", wins: 4, losses: 4, games: 8 },
  { name: "Mocsár", icon: "🌿", wins: 3, losses: 3, games: 6 },
  { name: "Póker", icon: "♠️", wins: 3, losses: 3, games: 6 },
];

export const activityData = [4, 8, 11, 6, 9, 7];
export const activityLabels = ["Okt", "Nov", "Dec", "Jan", "Feb", "Már"];

export const rivals = [
  { name: "Geri", pct: 72, color: "var(--success)" },
  { name: "Atis", pct: 58, color: "var(--orange)" },
  { name: "Papa", pct: 45, color: "var(--danger)" },
];

export const streaks = [6, 4, 3, 5, 2, 1, 3];
