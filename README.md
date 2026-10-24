NOTE: Not open-source yet, it's still under development...

# Testing

Everything needs PostgreSQL with the migrations applied (`docker compose up db`).

```bash
# API: unit + integration tests (auth, token refresh, cross-group authorization)
cd apps/api && DATABASE_URL=postgres://homegame:homegame@localhost:5432/homegame cargo test

# Web: lint, unit tests
npm run lint
npm run test:run --workspace=apps/web

# Web: end-to-end (mobile layout at 360/390/768/1280 px + session lifetime).
# Builds the app and starts the API + web servers itself.
npm run test:e2e --workspace=apps/web
```

# Scoring and statistics

One rule decides every place, win and loss — implemented in `apps/api/src/scoring.rs`
(official result on close) and `apps/web/lib/scoring/standings.ts` (live screens), both
tested against `packages/scoring/standings-cases.json`:

1. Participants are players with at least one score (never scored = not ranked).
2. More rounds played ranks first; with equal rounds the total decides (lowest wins for
   "min" games, highest for "max"). A missing round is **not** 0 points.
3. Equal rounds and equal total share the place (1, 1, 3); everyone on place 1 wins.
4. The last place loses, only if there is more than one place.

Statistics (`apps/web/lib/stats/`) are built from finished matches (`/stats/history`),
dated by the match itself and counted in Europe/Budapest calendar years. The ranking
needs a minimum number of matches (5, or fewer while nobody has 5) and orders by a win
rate adjusted for sample size. Typed but unsaved scores are drafts (`score_drafts`) and
never count anywhere.

# Sessions

Access tokens (JWT, `hg_access_token`) live `JWT_ACCESS_EXPIRY_MINUTES` (15). Refresh tokens
(`hg_refresh_token`) are opaque, stored hashed in `refresh_tokens`, rotated on every use and
live `JWT_REFRESH_EXPIRY_DAYS` (30, sliding). `apps/web/middleware.ts` refreshes before the
access token expires, `lib/api/client.ts` retries once after a 401, and
`components/auth/authKeepAlive.tsx` keeps an open tab (or a phone waking up) logged in.

# Folder Sturcture
```
homegame/
├── .github/
│   └── workflows/
│       ├── ci.yml             # runs tests on every PR
│       └── deploy.yml         # deploys to VPS on merge to main
│
├── apps/
│   ├── web/                   # Next.js frontend
│   └── api/                   # Rust backend
│
├── packages/
│   └── proto/                 # shared .proto files for gRPC
│       └── homegame.proto
│
├── infra/
│   ├── docker-compose.yml     # local dev
│   ├── docker-compose.prod.yml
│   └── nginx/
│       └── nginx.conf
│
├── scripts/
│   └── seed.sql               # local dev seed data
│
└── README.md
```

# App Structure
```
apps/web/
├── app/                         # App Router (Next.js 14+)
│   ├── layout.tsx               # root layout: fonts, global providers
│   ├── page.tsx                 # / redirects to /dashboard or /login
│   │
│   ├── (auth)/                  # route group — no shared layout with app
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── register/
│   │       └── page.tsx
│   │
│   ├── (app)/                   # route group — authenticated shell
│   │   ├── layout.tsx           # sidebar Nav + session guard
│   │   ├── dashboard/
│   │   │   └── page.tsx         # Winner/Stats page
│   │   ├── games/
│   │   │   ├── page.tsx         # list of custom games
│   │   │   ├── new/
│   │   │   │   └── page.tsx     # AddGame
│   │   │   └── [gameName]/
│   │   │       ├── page.tsx     # CustomGame (scoring view)
│   │   │       └── log/
│   │   │           └── page.tsx # CustomGameLog
│   │   ├── players/
│   │   │   ├── page.tsx         # player list (Add player)
│   │   │   └── [id]/
│   │   │       └── page.tsx     # PlayerInfo
│   │   └── settings/
│   │       └── page.tsx
│   │
│   └── (viewer)/                # read-only route group for viewer tokens
│       └── live/
│           └── [gameCode]/
│               └── page.tsx     # public live scoreboard (TV view)
│
├── components/
│   ├── ui/                      # generic building blocks (no business logic)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── skeleton.tsx         # reusable skeleton block
│   │   └── chart.tsx
│   │
│   ├── game/                    # feature-scoped components
│   │   ├── player-card.tsx
│   │   ├── player-card-skeleton.tsx
│   │   ├── score-input.tsx
│   │   └── live-scoreboard.tsx  # SSE consumer
│   │
│   ├── stats/
│   │   ├── bar-chart.tsx
│   │   ├── win-rate-grid.tsx
│   │   └── year-filter.tsx
│   │
│   └── nav/
│       ├── sidebar.tsx
│       └── nav-item.tsx
│
├── lib/
│   ├── api/                     # typed fetch wrappers (called from Server Components)
│   │   ├── games.ts
│   │   ├── players.ts
│   │   ├── stats.ts
│   │   └── auth.ts
│   ├── auth/
│   │   ├── session.ts           # iron-session or next-auth helpers
│   │   └── middleware.ts        # route protection
│   └── utils.ts
│
├── hooks/                       # client-side hooks only
│   ├── use-sse.ts               # SSE subscription hook
│   └── use-optimistic-score.ts  # optimistic UI for score entry
│
├── types/
│   ├── api.ts                   # response shapes from Rust API
│   └── domain.ts                # Player, Game, Score, etc.
│
├── middleware.ts                # Next.js edge middleware for auth
│
├── __tests__/
│   ├── components/
│   └── lib/
│
├── next.config.ts
├── tailwind.config.ts
└── vitest.config.ts
```
