# Docker — Complete Guide

## What Is Docker and Why Use It?

Docker packages an application and all of its dependencies (runtime, libraries, config) into a **container** — a lightweight, isolated process that runs the same way on any machine. No more "it works on my machine."

**Without Docker:**
- Deploy Rust: install Rust toolchain, compile on server, manage system libraries
- Deploy Node.js: install correct Node version, install npm packages, hope OS matches dev machine
- Postgres: install and configure per-OS

**With Docker:**
- Every service runs in an isolated container
- Exact same environment in development and production
- One command to start everything: `docker compose up`

---

## Core Concepts

### Image

An image is a **read-only template** — a snapshot of a filesystem with an OS, runtime, and your application baked in. Think of it like a class definition. Images are built from a `Dockerfile`.

```
Image: ghcr.io/balazsgyulai/scoreboard-api:latest
       └── Debian slim
           └── ca-certificates
               └── /app/api (compiled Rust binary)
               └── /app/migrations/
               └── /app/_legacy_mysql_dump.sql
```

### Container

A container is a **running instance of an image**. Think of it like an object (instance) created from a class (image). You can run many containers from the same image.

```
docker run ghcr.io/balazsgyulai/scoreboard-api:latest
           └── creates container: scoreboard_api_1
```

### Volume

Containers are **ephemeral** — when a container stops or is deleted, all data written inside it is lost. A volume is persistent storage that lives outside the container and is mounted into it.

```yaml
volumes:
  - pgdata:/var/lib/postgresql/data
```

This means the Postgres data directory is stored in a Docker-managed volume called `pgdata`, not inside the container. Restart or recreate the container — data survives.

### Network

Containers in the same Docker Compose project are on the same virtual network and can reach each other by **service name**. The Next.js container reaches the Rust API at `http://api:8080` — no IP address needed.

```
Docker internal network: scoreboard_default
├── db     → reachable as http://db:5432
├── api    → reachable as http://api:8080
└── web    → reachable as http://web:3000
```

From outside Docker (your browser, Apache), only explicitly published ports are reachable.

### Registry

A registry stores and serves images. This project uses **GitHub Container Registry** (`ghcr.io`). When you push an image, it's stored there. When the VPS pulls it, Docker downloads it from there.

```
Local machine → build image → push to ghcr.io
VPS           → pull from ghcr.io → run container
```

---

## The Dockerfiles

### Rust API Dockerfile (`apps/api/Dockerfile`)

```dockerfile
# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM rust:1.88-slim AS builder

# Install system dependencies needed to compile Rust crates
RUN apt-get update && apt-get install -y \
    pkg-config \        # needed to find system libraries
    libssl-dev \        # OpenSSL for TLS (reqwest, tonic)
    protobuf-compiler   # needed to compile .proto files (tonic-build)

WORKDIR /app

# Copy only the dependency manifests first (for layer caching — explained below)
COPY apps/api/Cargo.toml apps/api/Cargo.lock ./apps/api/
COPY apps/api/build.rs ./apps/api/build.rs
COPY apps/api/src ./apps/api/src
COPY apps/api/.sqlx ./apps/api/.sqlx      # pre-computed query metadata
COPY packages/proto ./packages/proto      # shared .proto definitions

# Tell sqlx not to connect to a real database — use cached metadata instead
ENV SQLX_OFFLINE=true

# Compile both binaries in release mode (optimized, no debug symbols)
RUN cargo build --manifest-path apps/api/Cargo.toml --release \
    --bin api \                    # the main HTTP server
    --bin import_legacy_mysql      # one-time migration tool

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM debian:bookworm-slim

# Only the SSL certificates are needed at runtime (for outbound TLS calls)
RUN apt-get update && apt-get install -y ca-certificates

WORKDIR /app

# Copy only the compiled binaries from the builder — not the entire Rust toolchain
COPY --from=builder /app/apps/api/target/release/api ./api
COPY --from=builder /app/apps/api/target/release/import_legacy_mysql ./import_legacy_mysql

# Copy migration SQL files (needed by sqlx::migrate! at startup)
COPY apps/api/migrations ./migrations

# Copy the legacy MySQL dump for the one-time import tool
COPY apps/api/_legacy_mysql_dump.sql ./_legacy_mysql_dump.sql

EXPOSE 8080
CMD ["./api"]
```

**Key concept — Multi-stage builds:**  
The builder stage uses `rust:1.88-slim` (~1.8 GB). The runtime stage uses `debian:bookworm-slim` (~80 MB). Only the compiled binary is copied from builder to runtime. Final image size: ~90 MB vs ~1.8 GB without multi-stage.

**Why `SQLX_OFFLINE=true`?**  
sqlx normally connects to a live database at compile time to verify your SQL queries are valid. In Docker, there's no database during the build. The `.sqlx/` directory contains pre-computed query metadata (generated on the developer's machine via `cargo sqlx prepare`) so the build works without a database.

---

### Next.js Web Dockerfile (`apps/web/Dockerfile`)

```dockerfile
# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first (layer caching — see below)
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci

# Copy all source files
COPY . .

# Build-time environment variables
# API_URL is used by Next.js server during SSR (internal Docker address)
ARG API_URL=http://api:8080
ENV API_URL=$API_URL

# NEXT_PUBLIC_API_URL is baked into the browser JS bundle at build time
# Must be the public-facing URL of the API
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build the Next.js app (output: standalone mode)
RUN npm run build --workspace=apps/web

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Standalone output is self-contained — includes Node.js modules, no npm install needed
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
# Run the standalone server (not "next start" — that requires next.config.ts and TypeScript)
CMD ["node", "apps/web/server.js"]
```

**Why standalone output?**  
`next.config.ts` sets `output: "standalone"` in production. This tells Next.js to output a minimal server at `.next/standalone/server.js` with only the necessary Node.js modules included. No `node_modules` directory, no dev tools, no TypeScript runtime needed. The final image is much smaller.

**Why `node server.js` instead of `next start`?**  
`next start` requires `next.config.ts` to be present and TypeScript to be installed. The standalone server is a plain Node.js file with the config already compiled in. It's faster to start and has no external dependencies.

**Why `ARG` and `ENV`?**  
`ARG` declares a build-time variable (passed with `--build-arg`). `ENV` sets a container environment variable that persists at runtime. For `NEXT_PUBLIC_API_URL`, we need it as `ENV` during the build step so Next.js can read it and bake it into the bundle.

---

## Docker Compose

Docker Compose is a tool that manages multi-container applications. Instead of running `docker run ...` with long flags for each service, you define everything in a YAML file and run one command.

### Development (`docker-compose.yml`)

```yaml
services:
  db:
    image: postgres:16-alpine        # use official Postgres image, Alpine variant (small)
    container_name: homegame-db
    restart: unless-stopped          # auto-restart on crash, stop only on manual stop
    environment:
      POSTGRES_DB: homegame          # creates this database on first start
      POSTGRES_USER: homegame
      POSTGRES_PASSWORD: homegame    # dev password — not sensitive
    ports:
      - "5432:5432"                  # host:container — exposes Postgres to your machine
    volumes:
      - pgdata:/var/lib/postgresql/data                    # persistent data
      - ./apps/api/migrations:/docker-entrypoint-initdb.d  # auto-run migrations on first start
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U homegame -d homegame"]
      interval: 5s
      timeout: 3s
      retries: 20                    # wait up to 100s for Postgres to be ready

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: homegame-api
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy   # don't start API until DB passes healthcheck
    environment:
      DATABASE_URL: postgres://homegame:homegame@db:5432/homegame
      JWT_SECRET: change-this-secret
      JWT_ACCESS_EXPIRY_MINUTES: "15"
      JWT_REFRESH_EXPIRY_DAYS: "7"
      PORT: "8080"
      RUST_LOG: info                 # Rust logging level
    ports:
      - "8080:8080"                  # exposed for direct API access in dev

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        API_URL: http://api:8080     # internal Docker network — Next.js → Rust
    container_name: homegame-web
    restart: unless-stopped
    depends_on:
      api:
        condition: service_started
    environment:
      API_URL: http://api:8080
      NODE_ENV: production
      PORT: "3000"
    ports:
      - "3000:3000"

volumes:
  pgdata:    # named volume — data persists across container recreation
```

### Production (`docker-compose.prod.yml`)

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: homegame
      POSTGRES_USER: homegame
      POSTGRES_PASSWORD: qEST8IpmmXEakQ==    # strong password
    volumes:
      - pgdata:/var/lib/postgresql/data
    # No ports — DB is not exposed to the internet, only accessible in Docker network

  api:
    image: ghcr.io/balazsgyulai/scoreboard-api:latest   # pull pre-built image
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"    # bound to localhost only — Apache proxies /live/ here
    environment:
      DATABASE_URL: postgres://homegame:qEST8IpmmXEakQ==@db:5432/homegame
      JWT_SECRET: ufqPMfPZ5Fq70zwShjQIRh+...
      REFRESH_TOKEN_SECRET: Fzbt1L0VwhF9dx36...
      PORT: 8080
    depends_on:
      - db

  web:
    image: ghcr.io/balazsgyulai/scoreboard-web:latest   # pull pre-built image
    restart: unless-stopped
    environment:
      API_URL: http://api:8080
    ports:
      - "127.0.0.1:3100:3000"    # bound to localhost only — Apache proxies here

volumes:
  pgdata:
```

**Key differences from dev:**
- Uses pre-built images from registry (not `build:`)
- API and web ports bound to `127.0.0.1` only (Apache is the only one that accesses them)
- DB has no exposed ports (only API can reach it inside Docker)
- Strong secrets in environment variables

---

## Build, Push, and Deploy Workflow

### Step 1: Build and Push Images (from local machine)

```bash
# Build the API image for both AMD64 (Intel/AMD servers) and ARM64 (Apple M-series, ARM VPS)
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -t ghcr.io/balazsgyulai/scoreboard-api:latest \
    --push \                    # push directly to registry after build
    -f apps/api/Dockerfile .    # Dockerfile location, . is the build context (root of monorepo)

# Build the web image
# NEXT_PUBLIC_API_URL must be the public URL where the API is reachable from browsers
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --build-arg NEXT_PUBLIC_API_URL=https://games.gyulaibalazs.hu \
    -t ghcr.io/balazsgyulai/scoreboard-web:latest \
    --push \
    -f apps/web/Dockerfile .
```

**Why `--platform linux/amd64,linux/arm64`?**  
Your development machine might be ARM64 (Apple Silicon). The VPS might be AMD64 (Intel). Building for both platforms ensures the correct binary runs regardless of the server's CPU architecture. Docker automatically picks the right one on pull.

**Why `buildx` instead of `build`?**  
`docker buildx` is the modern builder with multi-platform support. Regular `docker build` only builds for the current machine's architecture.

### Step 2: Deploy on the VPS

```bash
# SSH into your VPS first
ssh bali@your-vps-ip

# Navigate to your project directory
cd ~/scoreboard

# Pull the new images from the registry
docker compose -f docker-compose.prod.yml pull

# Recreate containers with the new images
# -d = detached (run in background)
docker compose -f docker-compose.prod.yml up -d
```

Docker Compose compares the running containers with the new images. Only containers whose image changed are recreated — the database container stays running throughout.

---

## One-Time: Running Database Migrations

The API does **not** auto-run migrations on startup. Migrations must be run manually when setting up a new environment.

```bash
# Copy migration files from the API container to the DB container
docker cp scoreboard_api_1:/app/migrations/. /tmp/migrations/
docker cp /tmp/migrations/. scoreboard_db_1:/tmp/migrations/

# Run all migration files in order
docker exec scoreboard_db_1 sh -c \
    'for f in /tmp/migrations/*.sql; do echo "Running $f"; psql -U homegame -d homegame -f "$f"; done'
```

### One-Time: Importing Legacy MySQL Data

```bash
docker compose -f docker-compose.prod.yml exec api ./import_legacy_mysql --truncate
```

This runs the `import_legacy_mysql` binary inside the running API container. It reads `_legacy_mysql_dump.sql` from `/app/`, parses it, and inserts all historical data into Postgres.

`--truncate` empties existing tables before importing. **Only use this on a fresh database or when you explicitly want to replace all data.**

---

## Essential Docker Commands

### Viewing Running Containers

```bash
docker ps                          # list running containers
docker ps -a                       # list all containers (including stopped)
```

Output columns: CONTAINER ID, IMAGE, COMMAND, CREATED, STATUS, PORTS, NAMES

### Logs

```bash
docker compose -f docker-compose.prod.yml logs api        # all logs for api service
docker compose -f docker-compose.prod.yml logs -f web     # follow (live tail) web logs
docker compose -f docker-compose.prod.yml logs --tail=50  # last 50 lines all services
```

### Executing Commands Inside a Running Container

```bash
# Open an interactive shell
docker exec -it scoreboard_db_1 sh

# Run a specific command
docker exec scoreboard_db_1 psql -U homegame -d homegame -c "SELECT COUNT(*) FROM users;"
docker exec scoreboard_api_1 ./import_legacy_mysql --truncate
```

`-it` = interactive + allocate TTY (needed for shells and interactive programs)

### Database Access

```bash
# Open psql inside the DB container
docker exec -it scoreboard_db_1 psql -U homegame -d homegame

# Useful psql commands:
\dt                 # list all tables
\d users            # describe the users table (columns, types, constraints)
SELECT * FROM users;
\q                  # quit
```

### Stopping and Starting

```bash
docker compose -f docker-compose.prod.yml stop     # stop containers (keeps them)
docker compose -f docker-compose.prod.yml start    # start stopped containers
docker compose -f docker-compose.prod.yml down     # stop AND remove containers
docker compose -f docker-compose.prod.yml down -v  # also remove volumes (DELETES DATA!)
```

⚠️ **`down -v` deletes all data.** The Postgres volume is destroyed. Only use for a clean reset.

### Checking Resource Usage

```bash
docker stats                    # live CPU/memory usage for all containers
docker stats scoreboard_api_1   # just one container
```

### Copying Files Between Host and Container

```bash
# Host → Container
docker cp ./myfile.sql scoreboard_db_1:/tmp/myfile.sql

# Container → Host
docker cp scoreboard_api_1:/app/migrations/. ./local-migrations/
```

### Cleaning Up

```bash
docker image prune         # remove dangling (untagged) images
docker image prune -a      # remove ALL unused images (frees disk space)
docker system prune        # remove stopped containers, unused networks, dangling images
docker system prune -a     # nuclear option: clean everything unused
```

---

## Layer Caching: Why the Dockerfile Order Matters

Docker builds images in layers. Each instruction (`RUN`, `COPY`, `ADD`) creates a layer that is **cached**. If nothing in that layer changed since the last build, Docker reuses the cached layer and skips the step.

**Bad order (slow):**
```dockerfile
COPY . .              # copies everything — any file change invalidates all subsequent layers
RUN npm ci            # reinstalls ALL packages every time any source file changes
```

**Good order (fast):**
```dockerfile
COPY package.json package-lock.json ./   # only package manifests
RUN npm ci                               # cached as long as package.json doesn't change

COPY . .                                 # source files (changes frequently, but npm ci is already cached)
RUN npm run build                        # only invalidated when source changes
```

The Dockerfiles in this project follow this pattern — dependency files are copied before source files so `npm ci` and `cargo build` are only re-run when dependencies actually change.

---

## Networking: How Containers Talk to Each Other

```
Docker compose creates a virtual network. Services find each other by service name.

┌─────────────────────────────────────────────┐
│  Docker Network: scoreboard_default          │
│                                              │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │   db    │    │   api   │    │   web   │  │
│  │:5432    │◀───│:8080    │◀───│:3000    │  │
│  └─────────┘    └─────────┘    └─────────┘  │
│                      │                       │
└──────────────────────┼──────────────────────┘
                       │ published ports
              127.0.0.1:8080 (host)
              127.0.0.1:3100 (host)
                       │
                  Apache2 (host)
                       │
                  Internet
```

- `web` → `api`: `http://api:8080` (Docker DNS resolves `api` to the container's IP)
- `api` → `db`: `postgres://homegame:...@db:5432/homegame`
- `api` → internet: `127.0.0.1:8080` (published, Apache proxies `/live/` here)
- `web` → internet: `127.0.0.1:3100` (published, Apache proxies everything else here)

---

## Summary

| Concept | What it is |
|---|---|
| Image | Read-only snapshot; built from Dockerfile |
| Container | Running instance of an image |
| Volume | Persistent storage outside the container |
| Network | Virtual LAN; containers find each other by service name |
| Registry | Remote storage for images (ghcr.io) |
| Multi-stage build | Build in one image, copy artifacts to smaller runtime image |
| `SQLX_OFFLINE=true` | Use cached query metadata instead of live DB at compile time |
| `output: standalone` | Next.js bundles everything into a single `server.js` |
| Layer caching | Copy dependency files before source files to avoid redundant installs |
| `127.0.0.1:PORT` | Bind port to localhost only — Apache is the only external entry point |
