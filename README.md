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